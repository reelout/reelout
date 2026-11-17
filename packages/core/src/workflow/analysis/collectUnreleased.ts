// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { showParsedGitHistory, type ShowGitHistoryOptions } from '#git'
import type { GitCommit } from '#types'
import type { ReleaseMarker } from '../committing/isReleaseCommit'
import { isReleaseCommit } from '../committing/isReleaseCommit'

export interface UnreleasedOptions extends ShowGitHistoryOptions {
  marker?: ReleaseMarker | undefined
}

export interface UnreleasedWindow {
  history: GitCommit[]
  stop: GitCommit | null
}

/**
 * Collect unreleased commits from repository history.
 *
 * Walks parsed commit history in order and gathers every commit preceding the
 * first release commit. Exposes the release commit that ended the walk so
 * callers can inspect it, for example to read its release filter trailer.
 *
 * @param cwd Path to the working directory for git commands
 * @param options Options for configuring Git history retrieval
 * @returns The unreleased commits and the release commit that stopped the walk
 */
export async function collectUnreleased(
  cwd: string,
  options: UnreleasedOptions = {}
): Promise<UnreleasedWindow> {
  const history: GitCommit[] = []

  for await (const commit of showParsedGitHistory(cwd, options)) {
    if (await isReleaseCommit(cwd, commit, options.marker)) {
      return { history, stop: commit }
    }

    history.push(commit)
  }

  return { history, stop: null }
}
