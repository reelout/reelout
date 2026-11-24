// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { Package, Release, ReleasePlan } from '@reelout/core'
import { PLUGIN_NAME } from './PLUGIN_NAME'

/**
 * A release plan whose data is complete for an npm publish.
 */
export type CompleteReleasePlan = ReleasePlan & {
  package: Package & { name: string }
  release: Release & { version: string }
}

/**
 * Determine whether a release plan carries the complete data a registry
 * publish requires.
 *
 * @param plan The release plan to inspect
 * @param pluginName Name of the plugin whose plans qualify, defaulting to the npm plugin
 * @returns True when the plan is plugin-provided, public, named, and versioned
 */
export function isCompleteReleasePlan(
  plan: ReleasePlan,
  pluginName: string = PLUGIN_NAME
): plan is CompleteReleasePlan {
  return (
    plan.package.provider === pluginName &&
    !plan.package.private &&
    typeof plan.package.name === 'string' &&
    typeof plan.release?.version === 'string'
  )
}
