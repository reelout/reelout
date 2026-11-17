// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { ReleaseType } from '#types'
import semver from 'semver'

/**
 * Downgrade a `major` release type to `minor` on zero-major versions.
 *
 * SemVer treats `0.y.z` versions as initial development where breaking
 * changes do not require a new major version. When `version` has a major
 * segment of `0`, returns `minor` so that breaking changes release `0.(y+1).0`
 * instead of `1.0.0`. Preserves every other release type, and keeps `major`
 * when `version` is not zero-major or cannot be parsed.
 *
 * @param version Current package version to inspect
 * @param releaseType Release type derived from commit history
 * @returns The effective release type after zero-major adjustment
 */
export function normalizeZeroMajorReleaseType(
  version: string | null | undefined,
  releaseType: ReleaseType | null | undefined
): ReleaseType | null | undefined {
  if (releaseType !== 'major') {
    return releaseType
  }

  const parsed = semver.parse(version)

  if (parsed?.major !== 0) {
    return releaseType
  }

  return 'minor'
}
