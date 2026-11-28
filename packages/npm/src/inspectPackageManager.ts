// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { ExecCommandOptions, ReleaseContext } from '@reelout/core'
import type { ConsolaInstance } from 'consola/core'
import { getPackageManagerFullVersion } from './getPackageManagerFullVersion'
import { hasOIDCAuth, hasOidcPlatform } from './hasAuth'
import { getPackageManagerVersion } from './getPackageManagerVersion'
import type { PackageManager } from './resolvePackageManager'
import { resolvePackageManager } from './resolvePackageManager'

export interface PackageManagerInfo {
  name: PackageManager
  isNpm: boolean
  isPnpm: boolean
  isYarn: boolean
  isYarnClassic: boolean
  isYarnBerry: boolean
  /**
   * Full semantic version of the active Yarn release, resolved while OIDC
   * environment tokens could publish with it, or undefined otherwise.
   */
  version?: string | undefined
}

/**
 * Inspect the active package manager and its capabilities in a directory.
 *
 * Identifies the configured package manager executable and queries its major
 * version to distinguish between Yarn Classic and Yarn Berry releases. Fails
 * when the Yarn major version cannot be determined instead of guessing the
 * release family, because authentication and publish commands differ between
 * the two.
 *
 * @param cwd Working directory path to inspect
 * @param options Additional execution, environment, and stream options
 * @param logger Unused; retained for backward compatibility
 * @returns Metadata object describing the active package manager
 * @throws If Yarn is active but its version cannot be determined
 */
export async function inspectPackageManager(
  cwd: string,
  options?: Partial<ExecCommandOptions>,
  logger?: ConsolaInstance | undefined
): Promise<PackageManagerInfo> {
  const packageManager = await resolvePackageManager(cwd)
  let isYarnClassic = false
  let isYarnBerry = false

  if (packageManager === 'yarn') {
    const majorVersion = await getPackageManagerVersion(cwd, 'yarn', options)

    if (majorVersion == null) {
      throw new Error(
        'The Yarn version could not be determined: run "yarn --version" to check the installation.'
      )
    }

    if (majorVersion >= 2) {
      isYarnBerry = true
    } else {
      isYarnClassic = true
    }
  }

  return {
    name: packageManager,
    isNpm: packageManager === 'npm',
    isPnpm: packageManager === 'pnpm',
    isYarn: packageManager === 'yarn',
    isYarnClassic,
    isYarnBerry,
  }
}

/**
 * Inspect the active package manager for a release, resolving Yarn Berry's
 * full version when OIDC environment tokens could publish with it.
 *
 * Inspects the package manager like `inspectPackageManager` and, for a Yarn
 * Berry release on a supported CI platform with OIDC environment tokens,
 * additionally resolves the full semantic version so the release can decide
 * whether the Yarn release publishes with OIDC trusted publishing. Other
 * package managers and token-less environments skip the extra version
 * query.
 *
 * @param context Release context containing environment and working directory
 * @returns Metadata object describing the active package manager
 */
export async function inspectVersionedPackageManager(
  context: ReleaseContext
): Promise<PackageManagerInfo> {
  const packageManager = await inspectPackageManager(context.cwd, {
    env: context.env,
  })

  if (
    !packageManager.isYarnBerry ||
    !hasOIDCAuth(context.env) ||
    !hasOidcPlatform(context.env)
  ) {
    return packageManager
  }

  const version =
    packageManager.version ??
    (await getPackageManagerFullVersion(context.cwd, 'yarn', {
      env: context.env,
      signal: context.signal,
    }))

  return version === undefined ? packageManager : { ...packageManager, version }
}
