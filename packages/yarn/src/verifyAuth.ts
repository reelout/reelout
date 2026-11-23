// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { Package, ReleaseContext } from '@reelout/core'
import { execCommand } from '@reelout/core'
import {
  inspectPackageManager,
  type PackageManagerInfo,
} from '@reelout/npm/inspectPackageManager'
import { hasAuth } from './hasAuth'
import { prepareAuth, type Env } from './prepareAuth'
import { resolvePublishRegistry } from './resolvePublishRegistry'

/**
 * Report that the registry credentials are invalid or expired.
 */
export const INVALID_CREDENTIALS_MESSAGE =
  'NPM_TOKEN or ambient registry credentials are invalid or expired.'

/**
 * The kind of registry authentication detected for a release.
 *
 * - `none`: no registry credentials are configured.
 * - `token`: `NPM_TOKEN` or ambient registry credentials are present.
 */
export type AuthKind = 'none' | 'token'

/**
 * Verify that registry authentication is available for a release.
 *
 * Classifies the configured authentication as `token` when `NPM_TOKEN` or
 * ambient registry credentials exist and `none` when no credentials are
 * configured. Credentials are validated with a `whoami` pre-flight against
 * the publish registry so expired tokens fail before packages are published.
 *
 * @param context Release context containing environment and working directory
 * @returns The detected authentication kind
 */
export async function verifyAuth(context: ReleaseContext): Promise<AuthKind> {
  const rootPackage = { location: '.', name: undefined } as Package

  if (context.env.NPM_TOKEN?.trim()) {
    const packageManager = await inspectPackageManager(context.cwd, {
      env: context.env,
    })

    await using env = await prepareAuth(context, rootPackage, packageManager)

    await assertRegistryAuth(context, rootPackage, packageManager, env)

    return 'token'
  }

  const packageManager = await inspectPackageManager(context.cwd, {
    env: context.env,
  })

  if (await hasAuth(context, rootPackage, packageManager)) {
    await assertRegistryAuth(context, rootPackage, packageManager)

    return 'token'
  }

  return 'none'
}

/**
 * Confirm registry credentials by querying the authenticated registry user.
 *
 * Runs the package manager's `whoami` command against the publish registry
 * and wraps failures in an error naming the invalid credentials, so invalid
 * or expired tokens abort the release before anything is published.
 *
 * @param context Release context containing environment and working directory
 * @param pkg Target package metadata object
 * @param packageManager Information about the active package manager
 * @param env Prepared authentication environment, if credentials were injected
 * @returns A promise that resolves when the registry accepts the credentials
 * @throws If the `whoami` command fails, carrying the original error as the cause
 */
async function assertRegistryAuth(
  context: ReleaseContext,
  pkg: Package,
  packageManager: Partial<PackageManagerInfo>,
  env?: Env
): Promise<void> {
  const registry = await resolvePublishRegistry(context, pkg, packageManager)

  try {
    if (packageManager.isYarnBerry) {
      await execCommand('yarn', ['npm', 'whoami'], {
        cwd: context.cwd,
        env: { ...context.env, ...env },
        signal: context.signal,
      })

      return
    }

    await execCommand('npm', ['whoami', '--registry', registry], {
      cwd: context.cwd,
      env: { ...context.env, ...env },
      signal: context.signal,
    })
  } catch (error) {
    throw new Error(INVALID_CREDENTIALS_MESSAGE, { cause: error })
  }
}
