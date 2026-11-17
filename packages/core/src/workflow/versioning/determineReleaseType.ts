// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { CommitClassifier, GitCommit, ReleaseType } from '#types'
import semver from 'semver'

/**
 * Determine the release type for a single commit.
 *
 * Returns `'minor'` for a commit marked as a breaking change while the
 * supplied `version` is zero-major (`0.y.z`), and `'major'` otherwise, since
 * SemVer treats `0.y.z` as initial development where breaking changes do not
 * require a new major version. Otherwise, routes the commit through the
 * custom `classifier` and ensures the resolved value is a valid semantic
 * versioning release type.
 *
 * @param classifier Function mapping commits to release types
 * @param commit Parsed commit to evaluate
 * @param version Current package version used to adjust zero-major breaking releases
 * @returns `ReleaseType` string, or `null` when no matching rule applies
 */
export function determineReleaseType(
  classifier: CommitClassifier,
  commit: GitCommit,
  version?: string | null | undefined
): ReleaseType | null {
  if (commit.notes.length > 0) {
    return semver.parse(version)?.major === 0 ? 'minor' : 'major'
  }

  const type = classifier(commit)

  switch (type) {
    case 'major':
    case 'minor':
    case 'patch':
      return type
  }

  return null
}
