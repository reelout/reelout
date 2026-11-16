// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { GIT_TRAILER_RELEASE_FILTER } from '#config'
import { getParsedGitCommit } from '#git'
import type { GitCommit } from '#types'

/**
 * Determine whether a commit is a filtered release commit.
 *
 * Fetches the commit with the release filter trailer parsed and checks
 * whether the trailer carries a value. Detects release commits created
 * by runs scoped with `--filter`.
 *
 * @param cwd Working directory path for Git commands
 * @param commit Commit object, hash string, or nullish value
 * @returns `true` if the commit carries a release filter trailer
 */
export async function isFilteredReleaseCommit(
  cwd: string,
  commit: GitCommit | string | null | undefined
): Promise<boolean> {
  if (!commit) {
    return false
  }

  try {
    const parsed = await getParsedGitCommit(
      cwd,
      typeof commit === 'string' ? commit : commit.hash,
      [GIT_TRAILER_RELEASE_FILTER]
    )

    return parsed.trailers.some(
      (trailer) => trailer.key === GIT_TRAILER_RELEASE_FILTER && !!trailer.value
    )
  } catch {
    return false
  }
}
