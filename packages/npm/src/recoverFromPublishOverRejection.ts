// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { ReleaseContext } from '@reelout/core'
import { formatError } from '@reelout/core'
import { colors } from 'consola/utils'
import type { PackageManagerInfo } from './inspectPackageManager'
import type { PublishablePlan } from './isPublishablePlan'
import { probePublishedVersion } from './probePublishedVersion'
import { proveSamePublication } from './proveSamePublication'
import { syncDistTag } from './syncDistTag'

/**
 * Recover from a publish-over conflict by verifying the concurrently
 * published version.
 *
 * Re-probes the registry and compares the published content with the local
 * package: an identical version completes the plan with its dist-tag synced,
 * while any other outcome rethrows the original publish error.
 *
 * @param context Release context containing environment, plans, and logger
 * @param plan The publishable plan whose publish hit the conflict
 * @param packageManager Information about the active package manager
 * @param originalError The publish error reporting the conflict
 * @returns A promise that resolves when the concurrent publication is verified
 * @throws The original publish error when the concurrent publication cannot
 * be verified as identical content
 */
export async function recoverFromPublishOverRejection(
  context: ReleaseContext,
  plan: PublishablePlan,
  packageManager: PackageManagerInfo,
  originalError: unknown
): Promise<void> {
  const target = `${plan.package.name}@${plan.release.version}`

  const probe = await probePublishedVersion(
    context,
    plan,
    packageManager
  ).catch((error: unknown) => {
    context.logger.debug(
      `Version ${target} could not be re-probed after a publish conflict: ${formatError(error)}`
    )

    return null
  })

  if (probe === null || probe.status === 'absent') {
    throw originalError
  }

  const verdict = await proveSamePublication(
    context,
    plan,
    packageManager,
    probe.tarballUrl
  )

  if (verdict.verdict !== 'identical') {
    throw originalError
  }

  context.logger.warn(
    colors.yellow(
      `Treating publish of "${target}" as complete: an identical version was published concurrently.`
    )
  )

  await syncDistTag(context, plan, packageManager, probe.distTags)
}
