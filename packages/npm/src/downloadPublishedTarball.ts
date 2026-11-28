// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { Package, ReleaseContext, ReleasePlan } from '@reelout/core'
import { formatError } from '@reelout/core'
import { structUtils } from '@yarnpkg/core'
import { npmConfigUtils } from '@yarnpkg/plugin-npm'
import type { PackageManagerInfo } from './inspectPackageManager'
import { loadConfig } from './loadConfig'
import { loadYarnConfig, type YarnConfigurationSection } from './loadYarnConfig'
import {
  getRegistryCredentialAliases,
  normalizeRegistry,
} from './normalizeRegistry'
import { resolvePublishRegistry } from './resolvePublishRegistry'

/** Timeout for published-tarball downloads, in milliseconds. */
const DOWNLOAD_TIMEOUT_MS = 60_000

/**
 * Options for downloading a published tarball.
 */
export interface DownloadPublishedTarballOptions {
  /**
   * The registry the package publishes to, when already known. Its
   * credentials, resolved with the publish flow's key derivation, are
   * preferred over the tarball URL's own registry.
   */
  publishRegistry?: string | undefined

  /** Download timeout in milliseconds, defaulting to 60 seconds. */
  timeoutMs?: number | undefined
}

/**
 * Download the published tarball of a package version from its registry.
 *
 * Resolves registry credentials the same way the package managers do —
 * ambient configuration first, preferring the publish registry's
 * credentials when `publishRegistry` is provided, then the `NPM_TOKEN`
 * environment variable when the tarball is served by the publish
 * registry's origin — and fetches the tarball over HTTP with an
 * `Authorization` header when credentials exist. OIDC identity tokens
 * are not sent because registry tarball endpoints do not accept them.
 * The download aborts when the release is aborted or it outlives its
 * timeout.
 *
 * @param context Release context containing environment and working directory
 * @param plan Release plan describing the target package
 * @param packageManager Information about the active package manager
 * @param tarballUrl Absolute URL of the published tarball
 * @param options Download options, defaulting to ambient resolution only
 * @returns The downloaded tarball bytes
 * @throws If the registry responds with a non-OK status
 */
export async function downloadPublishedTarball(
  context: ReleaseContext,
  plan: ReleasePlan,
  packageManager: Partial<PackageManagerInfo>,
  tarballUrl: string,
  options: DownloadPublishedTarballOptions = {}
): Promise<Buffer> {
  const authorization = await resolveTarballAuthorization(
    context,
    plan.package,
    packageManager,
    tarballUrl,
    options.publishRegistry
  )

  const response = await fetch(tarballUrl, {
    headers: authorization ? { authorization } : {},
    signal: requestSignal(context, options.timeoutMs),
  })

  if (!response.ok) {
    throw new Error(
      `Published tarball at "${tarballUrl}" could not be downloaded: HTTP ${response.status}`
    )
  }

  return Buffer.from(await response.arrayBuffer())
}

/**
 * Build the abort signal for a tarball download.
 *
 * Aborts when the release is aborted or the download outlives its
 * timeout, so a stalled registry cannot hang the release.
 *
 * @param context Release context containing environment and working directory
 * @param timeoutMs Download timeout in milliseconds, overriding the default
 * @returns The combined abort signal
 */
function requestSignal(
  context: ReleaseContext,
  timeoutMs: number | undefined
): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs ?? DOWNLOAD_TIMEOUT_MS)

  return context.signal ? AbortSignal.any([context.signal, timeout]) : timeout
}

/**
 * Resolve the `Authorization` header value for a tarball download.
 *
 * Derives the registry from the tarball URL and, when provided, the
 * publish registry, and looks up ambient credentials for both with the
 * active package manager's configuration — the publish registry's
 * credentials first, because the publish flow derives its
 * configuration keys from it, then the tarball URL's own registry.
 * Falls back to an `NPM_TOKEN` bearer token when no ambient
 * credentials exist and the tarball is served by the publish
 * registry's origin, so the token is never sent to an unrelated host.
 *
 * @param context Release context containing environment and working directory
 * @param pkg Target package metadata object
 * @param packageManager Information about the active package manager
 * @param tarballUrl Absolute URL of the published tarball
 * @param publishRegistry The registry the package publishes to, when known
 * @returns The authorization header value, or undefined for anonymous access
 */
async function resolveTarballAuthorization(
  context: ReleaseContext,
  pkg: Package,
  packageManager: Partial<PackageManagerInfo>,
  tarballUrl: string,
  publishRegistry: string | undefined
): Promise<string | undefined> {
  const registry = registryFromTarballUrl(tarballUrl)

  const normalizedPublishRegistry = normalizeRegistry(publishRegistry)

  const registries: string[] = []

  if (normalizedPublishRegistry !== undefined) {
    registries.push(normalizedPublishRegistry)
  }

  if (registry !== undefined && registry !== normalizedPublishRegistry) {
    registries.push(registry)
  }

  for (const candidate of registries) {
    const authorization = packageManager.isYarnBerry
      ? await resolveYarnRegistryAuthorization(context, pkg, candidate)
      : await resolveNpmRegistryAuthorization(context, candidate)

    if (authorization) {
      return authorization
    }
  }

  const token = context.env.NPM_TOKEN?.trim()

  if (!token) {
    return undefined
  }

  const tokenPublishRegistry =
    normalizedPublishRegistry ??
    (await resolvePublishRegistry(context, pkg, packageManager))

  return registryOriginsMatch(tokenPublishRegistry, tarballUrl)
    ? `Bearer ${token}`
    : undefined
}

/**
 * Check whether a registry and a tarball URL share the same origin.
 *
 * @param registry Registry URL the package publishes to
 * @param tarballUrl Absolute URL of the published tarball
 * @returns True when both URLs parse and share an origin, false otherwise
 */
function registryOriginsMatch(registry: string, tarballUrl: string): boolean {
  try {
    return new URL(registry).origin === new URL(tarballUrl).origin
  } catch {
    return false
  }
}

/**
 * Derive the registry URL that serves a tarball.
 *
 * @param tarballUrl Absolute URL of the published tarball
 * @returns The registry URL, or undefined when the tarball URL is invalid
 */
function registryFromTarballUrl(tarballUrl: string): string | undefined {
  try {
    return normalizeRegistry(new URL(tarballUrl).origin)
  } catch {
    return undefined
  }
}

/**
 * Resolve ambient Yarn Berry registry credentials for a registry.
 *
 * Checks the package scope's settings, the registry's `npmRegistries`
 * entry, and the top-level configuration when the registry is the
 * configured default, mirroring how Yarn itself resolves `npmAuthToken`
 * and `npmAuthIdent` values. Registries sharing credentials with this
 * one, such as the public npm registry's alias host, are checked
 * alongside it.
 *
 * @param context Release context containing environment and working directory
 * @param pkg Target package metadata object
 * @param registry Registry URL the tarball is served from
 * @returns The authorization header value, or undefined without credentials
 */
async function resolveYarnRegistryAuthorization(
  context: ReleaseContext,
  pkg: Package,
  registry: string
): Promise<string | undefined> {
  let configuration

  try {
    configuration = await loadYarnConfig(context.cwd)
  } catch (error) {
    context.logger.debug(
      `Yarn configuration could not be loaded for the tarball download: ${formatError(error)}`
    )

    return undefined
  }

  const ident = pkg.name ? structUtils.parseIdent(pkg.name) : undefined

  const scopeConfiguration = npmConfigUtils.getScopeConfiguration(
    ident ? ident.scope : null,
    { configuration }
  )

  const scopeAuthorization = authorizationFromYarnConfig(scopeConfiguration)

  if (scopeAuthorization) {
    return scopeAuthorization
  }

  const defaultRegistry =
    normalizeRegistry(configuration.get('npmPublishRegistry')) ??
    normalizeRegistry(configuration.get('npmRegistryServer'))

  for (const candidate of getRegistryCredentialAliases(registry)) {
    const registryConfiguration = npmConfigUtils.getRegistryConfiguration(
      candidate,
      { configuration }
    )

    const registryAuthorization = authorizationFromYarnConfig(
      registryConfiguration
    )

    if (registryAuthorization) {
      return registryAuthorization
    }

    if (
      defaultRegistry !== undefined &&
      getRegistryCredentialAliases(defaultRegistry).includes(candidate)
    ) {
      const defaultAuthorization = authorizationFromYarnConfig(configuration)

      if (defaultAuthorization) {
        return defaultAuthorization
      }
    }
  }

  return undefined
}

/**
 * Resolve ambient npm registry credentials for a registry.
 *
 * Reads the effective `.npmrc` configuration and extracts the registry's
 * bearer token or legacy basic-auth credentials. Registries sharing
 * credentials with this one, such as the public npm registry's alias
 * host, are checked alongside it.
 *
 * @param context Release context containing environment and working directory
 * @param registry Registry URL the tarball is served from
 * @returns The authorization header value, or undefined without credentials
 */
async function resolveNpmRegistryAuthorization(
  context: ReleaseContext,
  registry: string
): Promise<string | undefined> {
  let config

  try {
    config = await loadConfig(context.cwd, { env: context.env })
  } catch (error) {
    context.logger.debug(
      `npm configuration could not be loaded for the tarball download: ${formatError(error)}`
    )

    return undefined
  }

  for (const candidate of getRegistryCredentialAliases(registry)) {
    const credentials = config.getCredentialsByURI(candidate)

    if (credentials.token) {
      return `Bearer ${credentials.token}`
    }

    if (credentials.auth) {
      return `Basic ${credentials.auth}`
    }
  }

  return undefined
}

/**
 * Build an authorization header value from a Yarn registry configuration.
 *
 * Prefers the registry's bearer token and falls back to its basic-auth
 * ident, base64-encoding a plaintext `user:token` value the way Yarn
 * itself does while passing an already-encoded ident through unchanged.
 *
 * @param config The Yarn scope, registry, or top-level configuration to read
 * @returns The authorization header value, or undefined without credentials
 */
function authorizationFromYarnConfig(
  config: YarnConfigurationSection | null | undefined
): string | undefined {
  const token = config?.get('npmAuthToken')

  if (typeof token === 'string' && token) {
    return `Bearer ${token}`
  }

  const ident = config?.get('npmAuthIdent')

  if (typeof ident === 'string' && ident) {
    return ident.includes(':')
      ? `Basic ${Buffer.from(ident).toString('base64')}`
      : `Basic ${ident}`
  }

  return undefined
}
