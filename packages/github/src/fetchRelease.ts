// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { Octokit } from '@octokit/rest'
import type { GitRepository } from '@reelout/core'

/**
 * A GitHub release that already exists for a tag.
 */
export interface GitHubRelease {
  /** Numeric id of the existing release. */
  id: number
  /** Release name as it existed before the overwrite. */
  name: string | null
  /** Release body as it existed before the overwrite. */
  body: string | null
}

/**
 * Fetch the GitHub release that exists for a tag.
 *
 * @param octokit Authenticated Octokit client
 * @param repository Target repository
 * @param tagName Tag the release is looked up by
 * @returns The existing release, or null when the tag has no release
 */
export async function fetchRelease(
  octokit: Octokit,
  repository: GitRepository,
  tagName: string
): Promise<GitHubRelease | null> {
  try {
    const { data: existing } = await octokit.rest.repos.getReleaseByTag({
      owner: repository.owner,
      repo: repository.repo,
      tag: tagName,
    })

    return { id: existing.id, name: existing.name, body: existing.body ?? null }
  } catch (err) {
    if ((err as { status?: number } | undefined)?.status !== 404) {
      throw err
    }

    return null
  }
}
