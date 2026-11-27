// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { execGit } from '#util'
import type { ConsolaInstance } from 'consola'
import { countGitHistory } from '../history/countGitHistory'
import { withShallowLock } from '../repository/withShallowLock'
import { deleteGitTag } from './deleteGitTag'
import { isGitTagPresent } from './isGitTagPresent'

const MIN_HISTORY_DEPTH = 2
const ORIGIN_NOT_REPO = `fatal: 'origin' does not appear to be a git repository`
const REMOTE_REF_NOT_FOUND = `fatal: couldn't find remote ref`

/**
 * Options guarding the destructive local tag cleanup in `ensureGitTag`.
 */
export interface EnsureGitTagOptions {
  /**
   * Logger warned before a stale local tag is deleted.
   */
  logger?: ConsolaInstance | undefined

  /**
   * Skip deleting stale local tags, warning instead.
   */
  dryRun?: boolean | undefined
}

/**
 * Ensure a tag exists locally, fetching it shallowly from `origin` if needed.
 *
 * Acquires a shallow-fetch lock, verifies local presence and history depth,
 * attempts a shallow fetch of `refs/tags/<tag>` when required, and removes a
 * local tag if the remote reports the tag is missing — warning before the
 * deletion and skipping it entirely in dry-run mode.
 *
 * @param cwd Working directory
 * @param tag Tag name (for example `v1.2.0`)
 * @param options Dry-run and logging guards for the local tag deletion
 * @returns `true` if the tag is present or was fetched; otherwise `false`
 */
export function ensureGitTag(
  cwd: string,
  tag: string,
  options?: EnsureGitTagOptions
): Promise<boolean> {
  return withShallowLock(cwd, async () => {
    const tagRef = `refs/tags/${tag}`

    if (
      (await isGitTagPresent(cwd, tag)) &&
      (await countGitHistory(cwd, tagRef)) >= MIN_HISTORY_DEPTH
    ) {
      return true
    }

    try {
      await execGit(cwd, [
        'fetch',
        'origin',
        `${tagRef}:${tagRef}`,
        `--depth=${MIN_HISTORY_DEPTH}`,
        '--update-shallow',
        '--force',
      ])

      return true
    } catch (err) {
      const errorMessage = (err as Error | undefined)?.message

      if (errorMessage?.includes(ORIGIN_NOT_REPO)) {
        return await isGitTagPresent(cwd, tag)
      }

      if (errorMessage?.includes(REMOTE_REF_NOT_FOUND)) {
        if (await isGitTagPresent(cwd, tag)) {
          if (options?.dryRun) {
            options.logger?.warn(
              `[DRY RUN] Local tag "${tag}" would be deleted because the remote no longer reports it.`
            )
          } else {
            options?.logger?.warn(
              `Local tag "${tag}" is being deleted because the remote no longer reports it.`
            )

            await deleteGitTag(cwd, tag)
          }
        }
      }
    }

    return false
  })
}
