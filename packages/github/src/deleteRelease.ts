// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { GitRepository, ReleasePlan } from '@reelout/core'
import { createOctokit } from './createOctokit'

/**
 * Delete a GitHub release associated with a package tag.
 *
 * Skips deletion if the plan does not contain a valid tag name. Resolves gracefully
 * if the release does not exist on GitHub (e.g., 404 status).
 *
 * @param plan Release plan containing the tag associated with the release to delete
 * @param token GitHub authentication token
 * @param repository Target repository
 * @returns Promise that resolves when the release is deleted
 */
export async function deleteRelease(
  plan: ReleasePlan,
  token: string,
  repository: GitRepository
): Promise<void> {
  if (!plan.release?.tag?.name) {
    return
  }

  try {
    const octokit = createOctokit(token)

    const { data: release } = await octokit.rest.repos.getReleaseByTag({
      owner: repository.owner,
      repo: repository.repo,
      tag: plan.release.tag.name,
    })

    await octokit.rest.repos.deleteRelease({
      owner: repository.owner,
      repo: repository.repo,
      release_id: release.id,
    })
  } catch (err) {
    if ((err as { status?: number } | undefined)?.status === 404) {
      return
    }

    throw err
  }
}
