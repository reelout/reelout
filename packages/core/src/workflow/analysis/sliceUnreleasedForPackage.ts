// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { GitCommit, Package } from '#types'
import { isReleaseCommit } from '../committing/isReleaseCommit'
import type { UnreleasedOptions } from './collectUnreleased'
import { readPackageHistory } from './readPackageHistory'

/**
 * Yield unreleased commits from the history of a single package.
 *
 * Streams commits that touch the package files in historical order and stops
 * at the first release commit that also touches them, so every package keeps
 * its own release boundary instead of sharing the latest repository-wide
 * release commit.
 *
 * @param cwd Path to the working directory for git commands
 * @param pkg Package whose files scope the commit history
 * @param options Options for configuring Git history retrieval
 * @yields Parsed commits up to the package's most recent release commit
 */
export async function* sliceUnreleasedForPackage(
  cwd: string,
  pkg: Package,
  options: UnreleasedOptions = {}
): AsyncGenerator<GitCommit> {
  for await (const commit of readPackageHistory(cwd, pkg, options)) {
    if (await isReleaseCommit(cwd, commit, options.marker)) {
      break
    }

    yield commit
  }
}
