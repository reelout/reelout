// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { Package, ReleaseContext } from '@reelout/core'
import type { PackageManagerInfo } from './inspectPackageManager'
import { loadConfig } from './loadConfig'
import { resolvePublishRegistry } from './resolvePublishRegistry'

/**
 * Determine whether authentication credentials exist for a package registry.
 *
 * Checks OIDC environment tokens, scope-level settings, registry configs,
 * and standard auth credentials to verify registry access.
 *
 * @param context Release context containing environment and working directory
 * @param pkg Target package metadata object
 * @param packageManager Information about the active package manager
 * @returns True if authentication credentials exist, otherwise false
 */
export async function hasAuth(
  context: ReleaseContext,
  pkg: Package,
  packageManager: Partial<PackageManagerInfo>
): Promise<boolean> {
  if (hasOIDCAuth(context.env)) {
    return true
  }

  const registry = await resolvePublishRegistry(context, pkg, packageManager)

  const config = await loadConfig(context.cwd, { env: context.env })

  const credentials = config.getCredentialsByURI(registry)

  if (credentials.token || credentials.auth) {
    return true
  }

  return false
}

/**
 * Determine whether OpenID Connect environment tokens are configured.
 *
 * Detects a pre-issued `NPM_ID_TOKEN` or a GitHub Actions OIDC token pair
 * without reading configuration files or spawning package manager commands.
 *
 * @param env Environment variables to inspect
 * @returns True if OIDC environment tokens exist, otherwise false
 */
export function hasOIDCAuth(env: Readonly<NodeJS.ProcessEnv>): boolean {
  if (env.NPM_ID_TOKEN) {
    return true
  }

  if (env.ACTIONS_ID_TOKEN_REQUEST_URL && env.ACTIONS_ID_TOKEN_REQUEST_TOKEN) {
    return true
  }

  return false
}
