// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { GitCommit } from '#types'
import { formatError } from '#util'
import { getParsedGitCommit } from '../commit/getParsedGitCommit'
import { readGitHistory, type ReadGitHistoryOptions } from './readGitHistory'

/**
 * Yield parsed commits sequentially from repository history.
 *
 * Fetches commits using `readGitHistory` and parses each commit with
 * `getParsedGitCommit`. Yields successfully parsed `GitCommit` objects on demand
 * and skips unparsable commits, reporting each skipped commit through
 * `options.logger` at debug level when one is provided.
 *
 * @param cwd Repository working directory path
 * @param options Filter and pagination options passed to `readGitHistory`
 * @yields Parsed `GitCommit` objects in historical order
 */
export async function* readParsedGitHistory(
  cwd: string,
  options?: ReadGitHistoryOptions
): AsyncGenerator<GitCommit> {
  for await (const commit of readGitHistory(cwd, options)) {
    try {
      yield await getParsedGitCommit(cwd, commit)
    } catch (error: unknown) {
      options?.logger?.debug(
        `Commit "${commit}" could not be parsed and was skipped: ${formatError(error)}`
      )
    }
  }
}
