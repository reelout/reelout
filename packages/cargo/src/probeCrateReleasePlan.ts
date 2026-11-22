// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { ReleaseContext, ReleasePlan } from '@reelout/core'
import { colors } from 'consola/utils'
import type { CompleteCargoReleasePlan } from './isCompleteReleasePlan'
import { isPublishedCrateIdentical } from './isPublishedCrateIdentical'
import { probePublishedCrate } from './probePublishedCrate'
import type { SparseIndexClient } from './sparseIndex'

/**
 * Probe a complete release plan and mark it skipped when its version is
 * already published with identical content.
 *
 * @param context Release context containing environment, plans, and logger
 * @param plan The complete release plan to probe
 * @param index The shared sparse index client
 * @param skipped Set collecting plans whose publish is skipped
 * @returns A promise that resolves when the plan's registry version is
 * probed
 * @throws If the registry version holds content that cannot be verified as
 * identical to the local crate
 */
export async function probeCrateReleasePlan(
  context: ReleaseContext,
  plan: CompleteCargoReleasePlan,
  index: SparseIndexClient,
  skipped: Set<ReleasePlan>
): Promise<void> {
  const target = `${plan.package.name}@${plan.release.version}`

  const probe = await probePublishedCrate(
    plan.package.name,
    plan.release.version,
    { index }
  )

  if (probe.status === 'absent') {
    return
  }

  const identical = await isPublishedCrateIdentical(context, plan, probe.cksum)

  if (!identical) {
    throw new Error(
      `Version "${target}" was not published: the registry already has this version and its content could not be verified as identical.`
    )
  }

  context.logger.warn(
    colors.yellow(
      `Skipping publish of "${target}": already published with identical content.`
    )
  )

  skipped.add(plan)
}
