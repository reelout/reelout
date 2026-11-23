// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { Package, ReleaseContext, ReleasePlan } from '@reelout/core'
import { formatError } from '@reelout/core'
import { structUtils } from '@yarnpkg/core'
import { npmConfigUtils } from '@yarnpkg/plugin-npm'
import type { PackageManagerInfo } from '@reelout/npm/inspectPackageManager'
import { loadConfig } from '@reelout/npm/loadConfig'
import { normalizeRegistry } from '@reelout/npm/normalizeRegistry'
import {
  loadYarnConfig,
  type YarnRegistryConfig,
  type YarnScopeConfig,
} from './loadYarnConfig'

/**
 * Download the published tarball of a package version from its registry.
 *
 * Resolves registry credentials the same way Yarn does — ambient
 * configuration first, then the `NPM_TOKEN` environment variable — and
 * fetches the tarball over HTTP with an `Authorization` header when
 * credentials exist.
 *
 * @param context Release context containing environment and working directory
 * @param plan Release plan describing the target package
 * @param packageManager Information about the active package manager
 * @param tarballUrl Absolute URL of the published tarball
 * @returns The downloaded tarball bytes
 * @throws If the registry responds with a non-OK status
 */
export async function downloadPublishedTarball(
  context: ReleaseContext,
  plan: ReleasePlan,
  packageManager: Partial<PackageManagerInfo>,
  tarballUrl: string
): Promise<Buffer> {
  const authorization = await resolveTarballAuthorization(
    context,
    plan.package,
    packageManager,
    tarballUrl
  )

  const response = await fetch(tarballUrl, {
    headers: authorization ? { authorization } : {},
    ...(context.signal ? { signal: context.signal } : {}),
  })

  if (!response.ok) {
    throw new Error(
      `Published tarball at "${tarballUrl}" could not be downloaded: HTTP ${response.status}`
    )
  }

  return Buffer.from(await response.arrayBuffer())
}

/**
 * Resolve the `Authorization` header value for a tarball download.
 *
 * Derives the registry from the tarball URL, looks up ambient credentials for
 * it with the active Yarn release's configuration, and falls back to an
 * `NPM_TOKEN` bearer token when no ambient credentials exist.
 *
 * @param context Release context containing environment and working directory
 * @param pkg Target package metadata object
 * @param packageManager Information about the active package manager
 * @param tarballUrl Absolute URL of the published tarball
 * @returns The authorization header value, or undefined for anonymous access
 */
async function resolveTarballAuthorization(
  context: ReleaseContext,
  pkg: Package,
  packageManager: Partial<PackageManagerInfo>,
  tarballUrl: string
): Promise<string | undefined> {
  const registry = registryFromTarballUrl(tarballUrl)

  if (registry) {
    const authorization = packageManager.isYarnBerry
      ? await resolveYarnRegistryAuthorization(context, pkg, registry)
      : await resolveNpmRegistryAuthorization(context, registry)

    if (authorization) {
      return authorization
    }
  }

  const token = context.env.NPM_TOKEN

  return token ? `Bearer ${token}` : undefined
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
 * Checks the package scope's settings, the registry's `npmRegistries` entry,
 * and the top-level configuration when the registry is the configured
 * default, mirroring how Yarn itself resolves `npmAuthToken` and
 * `npmAuthIdent` values.
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
  ) as YarnScopeConfig | null

  const scopeAuthorization = authorizationFromYarnConfig(scopeConfiguration)

  if (scopeAuthorization) {
    return scopeAuthorization
  }

  const registryConfiguration = npmConfigUtils.getRegistryConfiguration(
    registry,
    { configuration }
  ) as YarnRegistryConfig | null

  const registryAuthorization = authorizationFromYarnConfig(
    registryConfiguration
  )

  if (registryAuthorization) {
    return registryAuthorization
  }

  const defaultRegistry =
    normalizeRegistry(configuration.get('npmPublishRegistry')) ??
    normalizeRegistry(configuration.get('npmRegistryServer'))

  if (defaultRegistry === registry) {
    return authorizationFromYarnConfig(configuration)
  }

  return undefined
}

/**
 * Resolve ambient npm registry credentials for a registry.
 *
 * Reads the effective `.npmrc` configuration and extracts the registry's
 * bearer token or legacy basic-auth credentials.
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

  const credentials = config.getCredentialsByURI(registry)

  if (credentials.token) {
    return `Bearer ${credentials.token}`
  }

  if (credentials.auth) {
    return `Basic ${credentials.auth}`
  }

  return undefined
}

/**
 * Build an authorization header value from a Yarn registry configuration.
 *
 * @param config The Yarn scope, registry, or top-level configuration to read
 * @returns The authorization header value, or undefined without credentials
 */
function authorizationFromYarnConfig(
  config: YarnRegistryConfig | null | undefined
): string | undefined {
  const token = config?.get('npmAuthToken')

  if (typeof token === 'string' && token) {
    return `Bearer ${token}`
  }

  const ident = config?.get('npmAuthIdent')

  if (typeof ident === 'string' && ident) {
    return `Basic ${ident}`
  }

  return undefined
}
