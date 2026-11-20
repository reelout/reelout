// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type {
  Package,
  Release,
  ReleaseContext,
  ReleasePlan,
} from '@reelout/core'
import { formatError } from '@reelout/core'
import { colors } from 'consola/utils'
import {
  inspectPackageManager,
  type PackageManagerInfo,
} from './inspectPackageManager'
import { isPublishOverRejection } from './isPublishOverRejection'
import { PLUGIN_NAME } from './pluginName'
import { probePublishedVersion } from './probePublishedVersion'
import { proveSamePublication } from './proveSamePublication'
import { publishPackage } from './publishPackage'
import { syncDistTag } from './syncDistTag'
import type { PublishAccess } from './types'

export interface PublishPlansOptions {
  access?: PublishAccess | null | undefined
  provenance?: boolean | undefined
  stage?: boolean | undefined
}

type PublishablePlan = ReleasePlan & {
  package: Package & { name: string }
  release: Release & { version: string }
}

/**
 * Publish all npm-provider release plans with publish-start probes.
 *
 * Probes each publishable plan's registry version before any package
 * publishes: an already published version with identical content skips the
 * publish (recorded as a skipped step with a warning) and syncs the release
 * channel dist-tag, while different or unverifiable content fails the release
 * before anything is published. During the publish loop, a publish-over
 * conflict is re-verified with the same comparison, so a version published
 * concurrently with identical content completes the plan instead of failing
 * it.
 *
 * @param context Release context containing environment, plans, and logger
 * @param options Publishing flags including access, provenance, and staging
 * @throws If a probed version holds different or unverifiable content, or a
 * publish fails for a reason other than a verified concurrent publication
 */
export async function publishPlans(
  context: ReleaseContext,
  options: PublishPlansOptions = {}
): Promise<void> {
  const publishable = context.plans.filter(isPublishablePlan)

  const packageManager =
    publishable.length > 0
      ? await inspectPackageManager(context.cwd, { env: context.env })
      : undefined

  const skipped = new Set<ReleasePlan>()

  if (packageManager) {
    for (const plan of publishable) {
      await probePlan(context, plan, packageManager, skipped)
    }
  }

  for (const plan of context.plans) {
    if (plan.package.provider !== PLUGIN_NAME || skipped.has(plan)) {
      continue
    }

    try {
      await publishPackage(context, plan, {
        dryRun: context.dryRun,
        tag: context.releaseChannel,
        access: options.access,
        provenance: options.provenance,
        stage: options.stage,
      })
    } catch (error) {
      if (
        packageManager === undefined ||
        !isPublishablePlan(plan) ||
        !isPublishOverRejection(error)
      ) {
        throw error
      }

      await recoverFromPublishOverRejection(
        context,
        plan,
        packageManager,
        error
      )
    }
  }
}

/**
 * Probe a publishable plan and mark it skipped when its version is already
 * published with identical content.
 *
 * @param context Release context containing environment, plans, and logger
 * @param plan The publishable plan to probe
 * @param packageManager Information about the active package manager
 * @param skipped Set collecting plans whose publish is skipped
 * @throws If the registry version holds different or unverifiable content
 */
async function probePlan(
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
    context.skippedSteps.push({
      plugin: PLUGIN_NAME,
      hook: 'publish',
      reason: `Version ${target} is already published with identical content.`,
    })

    context.logger.warn(
      colors.yellow(
        `Skipping publish of ${target}: already published with identical content.`
      )
    )

    await syncDistTag(context, plan, packageManager, probe.distTags)

    skipped.add(plan)

    return
  }

  if (verdict.verdict === 'different') {
    throw new Error(
      `Cannot publish ${target}: the registry already has this version with different content (${verdict.summary}).`
    )
  }

  throw new Error(
    `Cannot publish ${target}: the published content could not be verified (${verdict.reason}).`
  )
}

/**
 * Recover from a publish-over conflict by verifying the concurrently
 * published version.
 *
 * Re-probes the registry and compares the published content with the local
 * package: an identical version completes the plan as skipped-published with
 * its dist-tag synced, while any other outcome rethrows the original publish
 * error.
 *
 * @param context Release context containing environment, plans, and logger
 * @param plan The publishable plan whose publish hit the conflict
 * @param packageManager Information about the active package manager
 * @param originalError The publish error reporting the conflict
 * @throws The original publish error when the concurrent publication cannot
 * be verified as identical content
 */
async function recoverFromPublishOverRejection(
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

  context.skippedSteps.push({
    plugin: PLUGIN_NAME,
    hook: 'publish',
    reason: `Version ${target} was published concurrently with identical content.`,
  })

  context.logger.warn(
    colors.yellow(
      `Treating publish of ${target} as complete: an identical version was published concurrently.`
    )
  )

  await syncDistTag(context, plan, packageManager, probe.distTags)
}

/**
 * Determine whether a plan is publishable by the npm plugin.
 *
 * @param plan The release plan to inspect
 * @returns True when the plan is npm-provided, public, named, and versioned
 */
function isPublishablePlan(plan: ReleasePlan): plan is PublishablePlan {
  return (
    plan.package.provider === PLUGIN_NAME &&
    !plan.package.private &&
    typeof plan.package.name === 'string' &&
    typeof plan.release?.version === 'string'
  )
}
