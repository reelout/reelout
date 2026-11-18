// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { CommitClassifier, ReleasePlan, ReleaseType } from '#types'
import { normalizeReleaseType } from './normalizeReleaseType'
import { pickPriorityReleaseType } from './pickPriorityReleaseType'

/**
 * Derive the combined release type from a release plan.
 *
 * Processes the plan's commits sequentially, accumulating the
 * highest-precedence release type found by evaluating each individual commit
 * and comparing it against the current maximum via `pickPriorityReleaseType`.
 * Breaking commits resolve to `minor` while the plan's package version is
 * zero-major (`0.y.z`).
 *
 * @param classifier Function mapping commits to release types
 * @param plan Release plan carrying the commit history and package version
 * @returns `ReleaseType` string, or `null` when no matching rule applies
 */
export function deriveReleaseType(
  classifier: CommitClassifier,
  plan: Pick<ReleasePlan, 'history' | 'package'>
): ReleaseType | null {
  let releaseType: ReleaseType | null = null

  for (const commit of plan.history) {
    releaseType = pickPriorityReleaseType(
      releaseType,
      normalizeReleaseType(classifier, commit, plan.package.version)
    )
  }

  return releaseType
}
