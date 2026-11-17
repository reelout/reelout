// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { CommitClassifier, GitCommit, ReleaseType } from '#types'
import semver from 'semver'
import { determineReleaseType } from './determineReleaseType'
import { pickPriorityReleaseType } from './pickPriorityReleaseType'

/**
 * Derive the combined release type from a commit history collection.
 *
 * Processes commits sequentially, accumulating the highest-precedence release
 * type found by evaluating each individual commit and comparing it against the
 * current maximum via `pickPriorityReleaseType`. Downgrades a derived `major`
 * release type to `minor` while the supplied `version` is zero-major
 * (`0.y.z`), since SemVer treats `0.y.z` as initial development where
 * breaking changes do not require a new major version.
 *
 * @param classifier Function mapping commits to release types
 * @param history Array of parsed commits to evaluate
 * @param version Current package version used to adjust zero-major breaking releases
 * @returns `ReleaseType` string, or `null` when no matching rule applies
 */
export function deriveReleaseType(
  classifier: CommitClassifier,
  history: readonly GitCommit[],
  version?: string | null | undefined
): ReleaseType | null {
  let releaseType: ReleaseType | null = null

  for (const commit of history) {
    releaseType = pickPriorityReleaseType(
      releaseType,
      determineReleaseType(classifier, commit)
    )
  }

  if (releaseType === 'major' && semver.parse(version)?.major === 0) {
    return 'minor'
  }

  return releaseType
}
