// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { Package, ReleaseContext } from '@reelout/core'
import { structUtils } from '@yarnpkg/core'
import { npmConfigUtils } from '@yarnpkg/plugin-npm'
import semver from 'semver'
import type { PackageManagerInfo } from './inspectPackageManager'
import { loadConfig } from './loadConfig'
import { loadYarnConfig, type YarnConfigurationSection } from './loadYarnConfig'
import { normalizeRegistry } from './normalizeRegistry'
import {
  DEFAULT_REGISTRY,
  DEFAULT_YARN_REGISTRY,
  resolvePublishRegistry,
} from './resolvePublishRegistry'

/**
 * The first Yarn release that publishes with OIDC trusted publishing.
 */
export const MINIMUM_YARN_OIDC_VERSION = '4.3.0'

/**
 * The first Yarn release whose OIDC trusted-publishing gate includes
 * CircleCI.
 */
export const MINIMUM_YARN_CIRCLECI_OIDC_VERSION = '4.4.2'

/**
 * Determine whether authentication credentials exist for a package registry.
 *
 * Checks OIDC environment tokens and configured registry credentials: npm
 * and pnpm releases count OIDC environment tokens on the public npm
 * registry — the only registry whose trusted-publishing OIDC exchange
 * those package managers support — while Yarn Berry releases count them
 * only when a supported CI platform issued them and the resolved Yarn
 * release is 4.3.0 or newer, or 4.4.2 or newer on CircleCI, whose OIDC
 * gate Yarn added later. Yarn Classic releases never count OIDC
 * environment tokens. All releases then check scope-level settings,
 * registry configs, and standard auth credentials to verify registry
 * access.
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

  if (packageManager.isYarnBerry) {
    return (
      (await hasConfiguredAuthForRegistry(
        context,
        pkg,
        packageManager,
        registry
      )) || usesYarnOidcTrustedPublishing(packageManager, context.env, registry)
    )
  }

  return (
    usesOidcTrustedPublishing(packageManager, context.env, registry) ||
    (await hasConfiguredAuthForRegistry(context, pkg, packageManager, registry))
  )
}

/**
 * Determine whether ambient registry credentials are configured for a
 * package.
 *
 * Checks scope-level settings, registry configs, and standard auth
 * credentials to verify registry access, ignoring OIDC environment tokens,
 * so releases that authenticate through trusted publishing alone report
 * false.
 *
 * @param context Release context containing environment and working directory
 * @param pkg Target package metadata object
 * @param packageManager Information about the active package manager
 * @returns True if ambient registry credentials exist, otherwise false
 */
export async function hasConfiguredAuth(
  context: ReleaseContext,
  pkg: Pick<Package, 'location' | 'name'>,
  packageManager: Partial<PackageManagerInfo>
): Promise<boolean> {
  const registry = await resolvePublishRegistry(context, pkg, packageManager)

  return hasConfiguredAuthForRegistry(context, pkg, packageManager, registry)
}

/**
 * Determine whether configured registry credentials exist for a resolved
 * registry.
 *
 * Yarn Berry releases resolve credentials from Yarn configuration — scope
 * settings, registry settings, and the top-level settings of the default
 * publish registry — while every other package manager resolves them from
 * the npm configuration's registry credentials.
 *
 * @param context Release context containing environment and working directory
 * @param pkg Target package metadata object
 * @param packageManager Information about the active package manager
 * @param registry The package's resolved publish registry
 * @returns True if configured registry credentials exist, otherwise false
 */
async function hasConfiguredAuthForRegistry(
  context: ReleaseContext,
  pkg: Pick<Package, 'location' | 'name'>,
  packageManager: Partial<PackageManagerInfo>,
  registry: string
): Promise<boolean> {
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

    return false
  }

  const config = await loadConfig(context.cwd, { env: context.env })

  const credentials = config.getCredentialsByURI(registry)

  return Boolean(credentials.token || credentials.auth)
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
 * OIDC environment tokens authenticate npm and pnpm releases to the public
 * npm registry — the only registry whose trusted-publishing OIDC exchange
 * those package managers support — and Yarn Berry releases to the public
 * npm registry or its alias domain when a supported CI platform issued
 * the tokens and the resolved Yarn release is 4.3.0 or newer, or 4.4.2 or
 * newer on CircleCI, whose OIDC gate Yarn added later. Yarn Classic
 * releases and other registries never count them as credentials.
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
  if (packageManager.isYarnBerry) {
    return usesYarnOidcTrustedPublishing(packageManager, env, registry)
  }

  if (packageManager.isYarn) {
    return false
  }

  return hasOIDCAuth(env) && normalizeRegistry(registry) === DEFAULT_REGISTRY
}

/**
 * Determine whether a Yarn Berry release authenticates through OIDC
 * trusted publishing.
 *
 * Counts OIDC environment tokens as Yarn Berry credentials when a
 * supported CI platform issued them, the resolved Yarn release is 4.3.0
 * or newer — the first release whose npm plugin exchanges them — or
 * 4.4.2 or newer on CircleCI, the first release whose OIDC gate includes
 * it, and the publish registry is the public npm registry or its alias
 * domain, the only registries whose exchange Yarn Berry supports. Fails
 * closed: a Yarn release with an unknown version never counts, because
 * older Yarn Berry releases cannot exchange the tokens they are handed.
 *
 * @param packageManager Information about the active package manager
 * @param env Environment variables to inspect
 * @param registry The release's resolved publish registry, checked against
 * the public npm registry when provided
 * @returns True if the Yarn Berry release authenticates through OIDC
 * trusted publishing
 */
export function usesYarnOidcTrustedPublishing(
  packageManager: Partial<PackageManagerInfo>,
  env: Readonly<NodeJS.ProcessEnv>,
  registry?: string | undefined
): boolean {
  if (
    !packageManager.isYarnBerry ||
    !hasOidcPlatform(env) ||
    !hasOIDCAuth(env)
  ) {
    return false
  }

  const minimumVersion = env.CIRCLECI
    ? MINIMUM_YARN_CIRCLECI_OIDC_VERSION
    : MINIMUM_YARN_OIDC_VERSION

  const version = packageManager.version

  if (version === undefined || semver.lt(version, minimumVersion)) {
    return false
  }

  if (registry === undefined) {
    return true
  }

  const normalizedRegistry = normalizeRegistry(registry)

  return (
    normalizedRegistry === DEFAULT_REGISTRY ||
    normalizedRegistry === DEFAULT_YARN_REGISTRY
  )
}

/**
 * Determine whether a supported CI platform issued the OIDC environment
 * tokens.
 *
 * Yarn Berry offers its OIDC trusted-publishing exchange only on GitHub
 * Actions, GitLab CI, and CircleCI, so tokens from any other environment
 * never count as Yarn Berry credentials.
 *
 * @param env Environment variables to inspect
 * @returns True if a supported CI platform is active
 */
export function hasOidcPlatform(env: Readonly<NodeJS.ProcessEnv>): boolean {
  return Boolean(env.GITHUB_ACTIONS || env.GITLAB_CI || env.CIRCLECI)
}
