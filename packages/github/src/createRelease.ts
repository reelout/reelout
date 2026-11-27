// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { GitRepository, ReleaseContext, ReleasePlan } from '@reelout/core'
import { createOctokit } from './createOctokit'
import { deleteRelease } from './deleteRelease'
import { fetchRelease } from './fetchRelease'

/**
 * Rollback callback returned after a release was created or overwritten.
 */
export type ReleaseRollback = () => Promise<void>

/**
 * Create a GitHub release for a package tag, overwriting an existing one.
 *
 * Skips creation when the tag has no message. When a release already exists
 * for the tag, its name and notes are overwritten with the freshly generated
 * content and a warning is logged. Returns a rollback callback that restores
 * an overwritten release or deletes a release created by this call.
 *
 * @param context Release context containing commit and prerelease information
 * @param plan Release plan containing the tag to publish
 * @param token GitHub authentication token
 * @param repository Target repository
 * @returns Promise that resolves to a rollback callback for the release, or
 * undefined when creation was skipped
 */
export async function createRelease(
  context: ReleaseContext,
  plan: ReleasePlan,
  token: string,
  repository: GitRepository
): Promise<ReleaseRollback | void> {
  if (!plan.release?.tag?.message) {
    return
  }

  const { name: tagName, message } = plan.release.tag

  const octokit = createOctokit(token)

  const existing = await fetchRelease(octokit, repository, tagName)

  if (existing) {
    await octokit.rest.repos.updateRelease({
      owner: repository.owner,
      repo: repository.repo,
      release_id: existing.id,
      name: tagName,
      body: message,
    })

    context.logger.warn(
      `GitHub release for tag "${tagName}" already exists: its name and notes were overwritten with the freshly generated content.`
    )

    return async () => {
      await octokit.rest.repos.updateRelease({
        owner: repository.owner,
        repo: repository.repo,
        release_id: existing.id,
        // The API accepts null to clear a field, but Octokit's types forbid it.
        name: existing.name as string,
        body: existing.body as string,
      })
    }
  }

  await octokit.rest.repos.createRelease({
    owner: repository.owner,
    repo: repository.repo,
    tag_name: tagName,
    target_commitish: context.commit.hash,
    name: tagName,
    body: message,
    draft: false,
    prerelease: Boolean(context.versionQualifier),
  })

  return () => deleteRelease(plan, token, repository)
}
