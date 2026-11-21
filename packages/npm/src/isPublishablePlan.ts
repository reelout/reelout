// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { Package, Release, ReleasePlan } from '@reelout/core'
import { PLUGIN_NAME } from './PLUGIN_NAME'

/**
 * A release plan that is valid for publishing by the npm plugin.
 */
export type ValidReleasePlan = ReleasePlan & {
  package: Package & { name: string }
  release: Release & { version: string }
}

/**
 * Determine whether a plan is publishable by the npm plugin.
 *
 * @param plan The release plan to inspect
 * @returns True when the plan is npm-provided, public, named, and versioned
 */
export function isPublishablePlan(plan: ReleasePlan): plan is ValidReleasePlan {
  return (
    plan.package.provider === PLUGIN_NAME &&
    !plan.package.private &&
    typeof plan.package.name === 'string' &&
    typeof plan.release?.version === 'string'
  )
}
