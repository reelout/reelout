// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { GIT_TRAILER_RELEASE_FILTER } from '#config'
import type { GitCommit } from '#types'

/**
 * Read release filter patterns from a parsed commit.
 *
 * Collects the release filter trailer values and splits them into individual
 * comma-separated filter patterns, unescaping the commas within patterns.
 * Returns `null` when the commit carries no release filter trailer, so
 * callers can treat it as a release of every package.
 *
 * @param commit Parsed commit object or nullish value
 * @returns Filter patterns carried by the trailer, or `null` when absent
 */
export function readReleaseFilterPatterns(
  commit: GitCommit | null | undefined
): string[] | null {
  if (!commit) {
    return null
  }

  const values = commit.trailers
    .filter((trailer) => trailer.key === GIT_TRAILER_RELEASE_FILTER)
    .map((trailer) => trailer.value)

  if (values.length === 0) {
    return null
  }

  return values
    .flatMap((value) => value.split(/(?<!\\),/))
    .map((pattern) => pattern.trim())
    .map((pattern) => pattern.replaceAll('\\,', ','))
    .filter((pattern) => pattern.length > 0)
}
