// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { Package, Release, ReleasePlan } from '@reelout/core'
import { PLUGIN_NAME } from './PLUGIN_NAME'

/**
 * A release plan whose data is complete for a crate publish.
 */
export type CompleteReleasePlan = ReleasePlan & {
  package: Package & { name: string }
  release: Release & { version: string }
}

/**
 * Determine whether a release plan carries the complete data a crate
 * publish requires.
 *
 * @param plan The release plan to inspect
 * @returns True when the plan is cargo-provided, public, named, and
 * versioned
 */
export function isCompleteReleasePlan(
  plan: ReleasePlan
): plan is CompleteReleasePlan {
  return (
    plan.package.provider === PLUGIN_NAME &&
    !plan.package.private &&
    typeof plan.package.name === 'string' &&
    typeof plan.release?.version === 'string'
  )
}
