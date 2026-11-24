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
 * Report that the registry credentials are invalid or expired.
 */
export const INVALID_CREDENTIALS_MESSAGE =
  'NPM_TOKEN or ambient registry credentials are invalid or expired.'

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
 * Classifies the configured authentication as `oidc` when OIDC environment
 * tokens exist — taking precedence over `NPM_TOKEN` and ambient registry
 * credentials, mirroring the package managers' own preference — `token` when
 * `NPM_TOKEN` or ambient registry credentials exist, and `none` when no
 * credentials are configured. Yarn releases never classify as `oidc`: the
 * registry offers no OIDC exchange for Yarn, so their OIDC environment
 * tokens are ignored and token-shaped credentials decide. Token-shaped
 * credentials are validated with a `whoami` pre-flight against the publish
 * registry so expired tokens fail before packages are published; OIDC
 * tokens are trusted without verification.
 *
 * @param context Release context containing environment and working directory
 * @param packageManager Information about the active package manager, inspected from the working directory when omitted
 * @returns The detected authentication kind
 */
export async function verifyAuth(
  context: ReleaseContext,
  packageManager?: PackageManagerInfo
): Promise<AuthKind> {
  const rootPackage = { location: '.', name: undefined } as Package

  const manager =
    packageManager ??
    (await inspectPackageManager(context.cwd, { env: context.env }))

  if (!manager.isYarn && hasOIDCAuth(context.env)) {
    return 'oidc'
  }

  if (context.env.NPM_TOKEN?.trim()) {
    await using env = await prepareAuth(context, rootPackage, manager)

    await assertRegistryAuth(context, rootPackage, manager, env)

    return 'token'
  }

  if (await hasAuth(context, rootPackage, manager)) {
    await assertRegistryAuth(context, rootPackage, manager)

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
    throw new Error(INVALID_CREDENTIALS_MESSAGE, { cause: error })
  }
}
