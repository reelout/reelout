// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { Package, ReleaseContext } from '@reelout/core'
import { execCommand } from '@reelout/core'
import { hasAuth, hasOIDCAuth } from './hasAuth'
import {
  inspectPackageManager,
  type PackageManagerInfo,
} from './inspectPackageManager'
import { prepareAuth, type Env } from './prepareAuth'
import { resolvePublishRegistry } from './resolvePublishRegistry'

/**
 * The kind of registry authentication detected for a release.
 *
 * - `none`: no registry credentials are configured.
 * - `oidc`: OIDC environment tokens are present.
 * - `token`: `NPM_TOKEN` or ambient registry credentials are present.
 */
export type AuthKind = 'none' | 'oidc' | 'token'

/**
 * Verify that registry authentication is available for a release.
 *
 * Classifies the configured authentication as `token` when `NPM_TOKEN` or
 * ambient registry credentials exist, `oidc` when OIDC environment tokens
 * exist, and `none` when no credentials are configured. Token-shaped
 * credentials are validated with a `whoami` pre-flight against the publish
 * registry so expired tokens fail before packages are published; OIDC
 * tokens are trusted without verification.
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

  if (hasOIDCAuth(context.env)) {
    return 'oidc'
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

    await execCommand(
      packageManager.isPnpm ? 'pnpm' : 'npm',
      ['whoami', '--registry', registry],
      {
        cwd: context.cwd,
        env: { ...context.env, ...env },
        signal: context.signal,
      }
    )
  } catch (error) {
    throw new Error(
      'NPM_TOKEN or ambient registry credentials are invalid or expired.',
      { cause: error }
    )
  }
}
