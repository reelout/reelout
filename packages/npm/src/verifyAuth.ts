// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { Package, ReleaseContext } from '@reelout/core'
import { execCommand } from '@reelout/core'
import {
  hasAuth,
  hasConfiguredAuth,
  hasOIDCAuth,
  usesYarnOidcTrustedPublishing,
} from './hasAuth'
import {
  inspectVersionedPackageManager,
  type PackageManagerInfo,
} from './inspectPackageManager'
import { isCredentialsRejected } from './isCredentialsRejected'
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
 * Classifies the configured authentication as `oidc` when the release
 * publishes with OIDC environment tokens — npm and pnpm releases
 * whenever the tokens exist, mirroring their OIDC-first preference, and
 * Yarn Berry releases only when a supported CI platform issued them, the
 * resolved Yarn release is 4.3.0 or newer — 4.4.2 or newer on CircleCI,
 * whose OIDC gate Yarn added later — and no ambient registry
 * credentials take precedence — `token` when `NPM_TOKEN` or ambient
 * registry credentials exist, and `none` when no credentials are
 * configured. Yarn Classic releases never classify as `oidc`: the
 * registry offers no OIDC exchange for Yarn Classic, so their OIDC
 * environment tokens are ignored and token-shaped credentials decide.
 * Token-shaped credentials are validated with a `whoami` pre-flight
 * against the publish registry so expired tokens fail before packages
 * are published, reporting rejected credentials as invalid and other
 * failures as an unreachable registry; OIDC tokens are trusted without
 * verification.
 *
 * The `oidc` classification is deliberately registry-agnostic.
 * Verification runs before packages are discovered, and a release may
 * publish to several registries, so no single registry could gate the
 * classification; whether OIDC trusted publishing applies to a package
 * is decided later, once its plans and publish registries are known.
 *
 * @param context Release context containing environment and working directory
 * @param packageManager Information about the active package manager, inspected from the working directory when omitted
 * @returns The detected authentication kind
 */
export async function verifyAuth(
  context: ReleaseContext,
  packageManager?: PackageManagerInfo
): Promise<AuthKind> {
  const rootPackage: Pick<Package, 'location' | 'name'> = {
    location: '.',
    name: undefined,
  }

  const manager =
    packageManager ?? (await inspectVersionedPackageManager(context))

  if (manager.isYarnBerry) {
    if (
      usesYarnOidcTrustedPublishing(manager, context.env) &&
      !(await hasConfiguredAuth(context, rootPackage, manager))
    ) {
      return 'oidc'
    }
  } else if (!manager.isYarn && hasOIDCAuth(context.env)) {
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
 * Report that the publish registry could not be reached to verify
 * credentials.
 *
 * @param registry The publish registry that could not be reached
 * @returns The unreachable-registry error message
 */
function registryUnreachableMessage(registry: string): string {
  return `The publish registry "${registry}" could not be reached to verify credentials.`
}

/**
 * Confirm registry credentials by querying the authenticated registry user.
 *
 * Runs the package manager's `whoami` command against the publish registry
 * and classifies failures: rejections that report invalid or expired
 * credentials are rethrown naming the invalid credentials, and any other
 * failure is rethrown naming the unreachable registry, so a network outage
 * is not misreported as a credentials problem.
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
  pkg: Pick<Package, 'location' | 'name'>,
  packageManager: Partial<PackageManagerInfo>,
  env?: Env
): Promise<void> {
  const registry = await resolvePublishRegistry(context, pkg, packageManager)

  try {
    if (packageManager.isYarnBerry) {
      await execCommand('yarn', ['npm', 'whoami', '--publish'], {
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
    if (isCredentialsRejected(error)) {
      throw new Error(INVALID_CREDENTIALS_MESSAGE, { cause: error })
    }

    throw new Error(registryUnreachableMessage(registry), { cause: error })
  }
}
