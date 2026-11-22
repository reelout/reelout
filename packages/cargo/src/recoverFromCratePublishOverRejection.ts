// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { ReleaseContext } from '@reelout/core'
import { formatError } from '@reelout/core'
import { colors } from 'consola/utils'
import type { CompleteReleasePlan } from './isCompleteReleasePlan'
import { proveSameCratePublication } from './proveSameCratePublication'
import { probePublishedCrate } from './probePublishedCrate'
import type { SparseIndexClient } from './sparseIndex'

/**
 * Recover from a publish-over conflict by verifying the concurrently
 * published crate version.
 *
 * Re-reads the sparse index without the cache and compares the published
 * crate's checksum with a local pack: an identical version completes the
 * plan, while any other outcome rethrows the original publish error.
 *
 * @param context Release context containing environment, plans, and logger
 * @param plan The publishable plan whose publish hit the conflict
 * @param index The shared sparse index client
 * @param originalError The publish error reporting the conflict
 * @returns A promise that resolves when the concurrent publication is
 * verified
 * @throws The original publish error when the concurrent publication
 * cannot be verified as identical content
 */
export async function recoverFromCratePublishOverRejection(
  context: ReleaseContext,
  plan: CompleteReleasePlan,
  index: SparseIndexClient,
  originalError: unknown
): Promise<void> {
  const target = `${plan.package.name}@${plan.release.version}`

  const probe = await probePublishedCrate(
    plan.package.name,
    plan.release.version,
    { index, fresh: true }
  ).catch((error: unknown) => {
    context.logger.debug(
      `Version "${target}" could not be re-probed after a publish conflict: ${formatError(error)}`
    )

    return null
  })

  if (probe === null || probe.status === 'absent') {
    throw originalError
  }

  const identical = await proveSameCratePublication(context, plan, probe.cksum)

  if (!identical) {
    throw originalError
  }

  context.logger.warn(
    colors.yellow(
      `Treating publish of "${target}" as complete: an identical version was published concurrently.`
    )
  )
}
