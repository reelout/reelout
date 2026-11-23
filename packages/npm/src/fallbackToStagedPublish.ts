// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { formatError, type ReleaseContext } from '@reelout/core'
import { colors } from 'consola/utils'
import type { PackageManagerInfo } from './inspectPackageManager'
import type { CompleteReleasePlan } from './isCompleteReleasePlan'
import { normalizeRegistry } from './normalizeRegistry'
import { publishPackage, type PublishPackageOptions } from './publishPackage'
import {
  DEFAULT_REGISTRY,
  DEFAULT_YARN_REGISTRY,
  resolvePublishRegistry,
} from './resolvePublishRegistry'

/**
 * Fall back to staged publishing for a plan whose direct publish was
 * rejected.
 *
 * Retries the failed publish through the package manager's staged publish
 * command when the plan targets the public npm registry, warning when the
 * `stage` option explicitly disables the fallback. Skips the fallback when
 * the publish was already staged, the active package manager cannot stage,
 * or the plan targets another registry, leaving the original error to the
 * caller.
 *
 * @param context Release context containing environment and working directory
 * @param plan The complete release plan whose direct publish failed
 * @param packageManager Information about the active package manager
 * @param options Publishing flags the failed direct publish was invoked with
 * @param originalError The error the direct publish failed with
 * @returns True when the plan was staged for publishing, false when the
 * fallback did not apply
 * @throws If the staged publish attempt failed
 */
export async function fallbackToStagedPublish(
  context: ReleaseContext,
  plan: CompleteReleasePlan,
  packageManager: PackageManagerInfo,
  options: PublishPackageOptions,
  originalError: unknown
): Promise<boolean> {
  const target = `${plan.package.name}@${plan.release.version}`

  if (options.stage === false) {
    context.logger.warn(
      colors.yellow(
        `Staged publish fallback for "${target}" is disabled: the "stage" option is set to false.`
      )
    )

    return false
  }

  if (options.stage === true || packageManager.isYarnClassic) {
    return false
  }

  const registry = normalizeRegistry(
    await resolvePublishRegistry(context, plan.package, packageManager)
  )

  if (registry !== DEFAULT_REGISTRY && registry !== DEFAULT_YARN_REGISTRY) {
    return false
  }

  context.logger.debug(
    `Direct publish of "${target}" was rejected: ${formatError(originalError)}`
  )

  context.logger.warn(
    colors.yellow(
      `Falling back to staged publish of "${target}": the registry requires staged publishing.`
    )
  )

  await publishPackage(context, plan, { ...options, stage: true })

  return true
}
