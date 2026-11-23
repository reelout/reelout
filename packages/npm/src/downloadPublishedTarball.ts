// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { ReleaseContext } from '@reelout/core'
import { formatError } from '@reelout/core'
import { loadConfig } from './loadConfig'
import { normalizeRegistry } from './normalizeRegistry'

/**
 * Download the published tarball of a package version from its registry.
 *
 * Resolves registry credentials the same way the package managers do —
 * ambient configuration first, then the `NPM_TOKEN` environment variable —
 * and fetches the tarball over HTTP with an `Authorization` header when
 * credentials exist. OIDC identity tokens are not sent because registry
 * tarball endpoints do not accept them.
 *
 * @param context Release context containing environment and working directory
 * @param tarballUrl Absolute URL of the published tarball
 * @returns The downloaded tarball bytes
 * @throws If the registry responds with a non-OK status
 */
export async function downloadPublishedTarball(
  context: ReleaseContext,
  tarballUrl: string
): Promise<Buffer> {
  const authorization = await resolveTarballAuthorization(context, tarballUrl)

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
 * it in the effective `.npmrc` configuration, and falls back to an
 * `NPM_TOKEN` bearer token when no ambient credentials exist.
 *
 * @param context Release context containing environment and working directory
 * @param tarballUrl Absolute URL of the published tarball
 * @returns The authorization header value, or undefined for anonymous access
 */
async function resolveTarballAuthorization(
  context: ReleaseContext,
  tarballUrl: string
): Promise<string | undefined> {
  const registry = registryFromTarballUrl(tarballUrl)

  if (registry) {
    const authorization = await resolveNpmRegistryAuthorization(
      context,
      registry
    )

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
