// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { ReleaseContext, ReleasePlan } from '@reelout/core'
import { execCommand } from '@reelout/core'
import path from 'node:path'
import type { PackageManagerInfo } from './inspectPackageManager'
import { prepareAuth } from './prepareAuth'
import { resolvePublishRegistry } from './resolvePublishRegistry'

/**
 * Sync the release channel dist-tag to a published package version.
 *
 * Points the context's release channel dist-tag — or `latest` when no channel
 * is configured — at the released version when the registry's current tag does
 * not already reference it. Previews the command without running it in
 * dry-run mode.
 *
 * @param context Release context containing environment and working directory
 * @param plan Release plan describing the published package
 * @param packageManager Information about the active package manager
 * @param distTags The registry's current dist-tags for the package
 * @returns A promise that resolves once the dist-tag references the released
 * version
 */
export async function syncDistTag(
  context: ReleaseContext,
  plan: ReleasePlan,
  packageManager: PackageManagerInfo,
  distTags: Record<string, string>
): Promise<void> {
  const name = plan.package.name
  const version = plan.release?.version

  /* istanbul ignore if -- callers guarantee a named, versioned plan */
  if (name == null || version == null) {
    return
  }

  const tag = context.releaseChannel ?? 'latest'

  if (distTags[tag] === version) {
    context.logger.debug(
      `Dist-tag "${tag}" already points at "${name}@${version}".`
    )

    return
  }

  const target = `${name}@${version}`

  if (context.dryRun) {
    context.logger.debug(
      `[DRY RUN] Would sync dist-tag "${tag}" to "${target}".`
    )

    return
  }

  const packageDir = path.resolve(context.cwd, plan.package.location)

  await using env = await prepareAuth(context, plan.package, packageManager)

  if (packageManager.isYarnBerry) {
    await execCommand('yarn', ['npm', 'tag', 'add', target, tag], {
      cwd: packageDir,
      env: { ...context.env, ...env },
      signal: context.signal,
    })
  } else {
    const registry = await resolvePublishRegistry(
      context,
      plan.package,
      packageManager
    )

    await execCommand(
      packageManager.isPnpm ? 'pnpm' : 'npm',
      ['dist-tag', 'add', target, tag, '--registry', registry],
      {
        cwd: packageDir,
        env: { ...context.env, ...env },
        signal: context.signal,
      }
    )
  }

  context.logger.debug(`Synced dist-tag "${tag}" to "${target}".`)
}
