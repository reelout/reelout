// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { ShowGitHistoryOptions } from '#git'
import type { GitCommit } from '#types'
import type { ReleaseMarker } from '../committing/isReleaseCommit'
import { collectUnreleased } from './collectUnreleased'

export interface SliceUnreleasedOptions extends ShowGitHistoryOptions {
  marker?: ReleaseMarker | undefined
}

/**
 * Yield parsed commits from the workspace until a release commit is found.
 *
 * Collects unreleased commits ahead of the most recent release commit and
 * yields them in order.
 *
 * @param cwd Path to the working directory
 * @param options Options for configuring Git history retrieval
 * @yields Parsed `Commit` objects up to the most recent release commit
 */
export async function* sliceUnreleased(
  cwd: string,
  options?: SliceUnreleasedOptions
): AsyncGenerator<GitCommit> {
  const { history } = await collectUnreleased(cwd, options)

  yield* history
}
