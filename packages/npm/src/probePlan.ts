// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { ReleaseContext, ReleasePlan } from '@reelout/core'
import { colors } from 'consola/utils'
import type { PackageManagerInfo } from './inspectPackageManager'
import type { PublishablePlan } from './isPublishablePlan'
import { probePublishedVersion } from './probePublishedVersion'
import { proveSamePublication } from './proveSamePublication'
import { syncDistTag } from './syncDistTag'

/**
 * Probe a publishable plan and mark it skipped when its version is already
 * published with identical content.
 *
 * @param context Release context containing environment, plans, and logger
 * @param plan The publishable plan to probe
 * @param packageManager Information about the active package manager
 * @param skipped Set collecting plans whose publish is skipped
 * @returns A promise that resolves when the plan's registry version is probed
 * @throws If the registry version holds different or unverifiable content
 */
export async function probePlan(
  context: ReleaseContext,
  plan: PublishablePlan,
  packageManager: PackageManagerInfo,
  skipped: Set<ReleasePlan>
): Promise<void> {
  const target = `${plan.package.name}@${plan.release.version}`

  const probe = await probePublishedVersion(context, plan, packageManager)

  if (probe.status === 'absent') {
    return
  }

  const verdict = await proveSamePublication(
    context,
    plan,
    packageManager,
    probe.tarballUrl
  )

  if (verdict.verdict === 'identical') {
    context.logger.warn(
      colors.yellow(
        `Skipping publish of "${target}": already published with identical content.`
      )
    )

    await syncDistTag(context, plan, packageManager, probe.distTags)

    skipped.add(plan)

    return
  }

  if (verdict.verdict === 'different') {
    throw new Error(
      `Version "${target}" was not published: the registry already has this version with different content (${verdict.summary}).`
    )
  }

  throw new Error(
    `Version "${target}" was not published: the published content could not be verified (${verdict.reason}).`
  )
}
