// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { GIT_TRAILER_RELEASE_FILTER } from '#config'
import { getParsedGitCommit } from '#git'
import type { GitCommit } from '#types'
import { readReleaseFilterPatterns } from './readReleaseFilterPatterns'

/**
 * Determine whether a commit carries a release filter trailer.
 *
 * Fetches string commit references through Git and reads pre-parsed trailers
 * from commit objects. Detects release commits created by runs scoped with
 * `--filter`.
 *
 * @param cwd Working directory path for Git commands
 * @param commit Commit object, hash string, or nullish value
 * @returns `true` if the commit carries a release filter trailer
 */
export async function hasReleaseFilterTrailer(
  cwd: string,
  commit: GitCommit | string | null | undefined
): Promise<boolean> {
  if (typeof commit === 'string') {
    try {
      return (
        readReleaseFilterPatterns(
          await getParsedGitCommit(cwd, commit, [GIT_TRAILER_RELEASE_FILTER])
        ) !== null
      )
    } catch {
      return false
    }
  }

  return readReleaseFilterPatterns(commit) !== null
}
