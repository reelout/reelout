// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { ReleaseContext, ReleasePlan } from '@reelout/core'
import { fallbackToStagedPublish } from './fallbackToStagedPublish'
import type { PackageManagerInfo } from './inspectPackageManager'
import {
  isCompleteReleasePlan,
  type CompleteReleasePlan,
} from './isCompleteReleasePlan'
import { isPublishOverRejection } from './isPublishOverRejection'
import { isStageRequiredRejection } from './isStageRequiredRejection'
import { publishPackage, type PublishPackageOptions } from './publishPackage'
import { recoverFromPublishOverRejection } from './recoverFromPublishOverRejection'

/**
 * Publish a plugin's release plans with the staged-publishing and
 * publish-over fallbacks applied.
 *
 * Publishes the plans the plugin provided and the probe did not skip. Falls
 * back to staged publishing when the registry rejects a direct publish with
 * a staged-publishing requirement, recovers from a publish-over rejection
 * by verifying the concurrently published version, and propagates every
 * other failure.
 *
 * @param context Release context containing plans and logger
 * @param pluginName Name of the plugin whose plans are published
 * @param packageManager Information about the active package manager, or
 * undefined when no plan is publishable
 * @param publishOptions Publishing flags the plans are published with
 * @param skipped Plans the probe marked as already published
 * @returns The plans that were staged instead of published
 * @throws If a publish fails and no fallback recovers it
 */
export async function publishPlans(
  context: ReleaseContext,
  pluginName: string,
  packageManager: PackageManagerInfo | undefined,
  publishOptions: PublishPackageOptions,
  skipped: ReadonlySet<ReleasePlan>
): Promise<CompleteReleasePlan[]> {
  const staged: CompleteReleasePlan[] = []

  for (const plan of context.plans) {
    if (plan.package.provider !== pluginName || skipped.has(plan)) {
      continue
    }

    try {
      await publishPackage(context, plan, publishOptions)
    } catch (error) {
      if (
        packageManager === undefined ||
        !isCompleteReleasePlan(plan, pluginName)
      ) {
        throw error
      }

      if (isStageRequiredRejection(error)) {
        if (
          await fallbackToStagedPublish(
            context,
            plan,
            packageManager,
            publishOptions,
            error
          )
        ) {
          staged.push(plan)
        } else {
          throw error
        }
      } else if (isPublishOverRejection(error)) {
        await recoverFromPublishOverRejection(
          context,
          plan,
          packageManager,
          error
        )
      } else {
        throw error
      }
    }
  }

  return staged
}
