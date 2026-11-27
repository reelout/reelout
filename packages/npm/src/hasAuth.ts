// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { Package, ReleaseContext } from '@reelout/core'
import { structUtils } from '@yarnpkg/core'
import { npmConfigUtils } from '@yarnpkg/plugin-npm'
import type { PackageManagerInfo } from './inspectPackageManager'
import { loadConfig } from './loadConfig'
import { loadYarnConfig, type YarnConfigurationSection } from './loadYarnConfig'
import { normalizeRegistry } from './normalizeRegistry'
import {
  DEFAULT_REGISTRY,
  resolvePublishRegistry,
} from './resolvePublishRegistry'

/**
 * Determine whether authentication credentials exist for a package registry.
 *
 * Checks OIDC environment tokens for npm and pnpm releases on the public
 * npm registry — the only registry whose trusted-publishing OIDC exchange
 * the package manager CLI supports — then scope-level settings, registry
 * configs, and standard auth credentials to verify registry access. Yarn
 * releases skip the OIDC check: the registry offers no OIDC exchange for
 * Yarn, so OIDC environment tokens never count as Yarn credentials.
 *
 * @param context Release context containing environment and working directory
 * @param pkg Target package metadata object
 * @param packageManager Information about the active package manager
 * @returns True if authentication credentials exist, otherwise false
 */
export async function hasAuth(
  context: ReleaseContext,
  pkg: Pick<Package, 'location' | 'name'>,
  packageManager: Partial<PackageManagerInfo>
): Promise<boolean> {
  const registry = await resolvePublishRegistry(context, pkg, packageManager)

  if (usesOidcTrustedPublishing(packageManager, context.env, registry)) {
    return true
  }

  if (packageManager.isYarnBerry) {
    const hasTokenOrIdent = (
      config: YarnConfigurationSection | null | undefined
    ) => {
      return Boolean(config?.get('npmAuthToken') || config?.get('npmAuthIdent'))
    }

    const configuration = await loadYarnConfig(context.cwd)

    const ident = pkg.name ? structUtils.parseIdent(pkg.name) : undefined

    const scopeConfiguration = npmConfigUtils.getScopeConfiguration(
      ident ? ident.scope : null,
      { configuration }
    )

    if (hasTokenOrIdent(scopeConfiguration)) {
      return true
    }

    const registryConfiguration = npmConfigUtils.getRegistryConfiguration(
      registry,
      { configuration }
    )

    if (hasTokenOrIdent(registryConfiguration)) {
      return true
    }

    const defaultRegistry =
      normalizeRegistry(configuration.get('npmPublishRegistry')) ??
      normalizeRegistry(configuration.get('npmRegistryServer'))

    if (defaultRegistry === registry && hasTokenOrIdent(configuration)) {
      return true
    }
  } else {
    const config = await loadConfig(context.cwd, { env: context.env })

    const credentials = config.getCredentialsByURI(registry)

    if (credentials.token || credentials.auth) {
      return true
    }
  }

  return false
}

/**
 * Determine whether OpenID Connect environment tokens are configured.
 *
 * Detects a pre-issued `NPM_ID_TOKEN` or a GitHub Actions OIDC token pair
 * without reading configuration files or spawning package manager commands.
 * Whitespace-only values count as absent.
 *
 * @param env Environment variables to inspect
 * @returns True if OIDC environment tokens exist, otherwise false
 */
export function hasOIDCAuth(env: Readonly<NodeJS.ProcessEnv>): boolean {
  if (env.NPM_ID_TOKEN?.trim()) {
    return true
  }

  const requestUrl = env.ACTIONS_ID_TOKEN_REQUEST_URL?.trim()

  const requestToken = env.ACTIONS_ID_TOKEN_REQUEST_TOKEN?.trim()

  if (requestUrl && requestToken) {
    return true
  }

  return false
}

/**
 * Determine whether a release authenticates through OIDC trusted publishing.
 *
 * OIDC environment tokens authenticate only npm and pnpm releases to the
 * public npm registry — the only registry whose trusted-publishing OIDC
 * exchange the package manager CLI supports — so Yarn releases and other
 * registries never count them as credentials.
 *
 * @param packageManager Information about the active package manager
 * @param env Environment variables to inspect
 * @param registry The release's resolved publish registry
 * @returns True if the release authenticates through OIDC trusted publishing
 */
export function usesOidcTrustedPublishing(
  packageManager: Partial<PackageManagerInfo>,
  env: Readonly<NodeJS.ProcessEnv>,
  registry: string
): boolean {
  return (
    !packageManager.isYarn &&
    hasOIDCAuth(env) &&
    normalizeRegistry(registry) === DEFAULT_REGISTRY
  )
}
