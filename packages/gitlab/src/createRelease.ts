// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { Gitlab } from '@gitbeaker/rest'
import type { GitRepository, ReleaseContext, ReleasePlan } from '@reelout/core'
import { deleteRelease } from './deleteRelease'
import { fetchRelease } from './fetchRelease'
import { restoreRelease } from './restoreRelease'

/**
 * Rollback callback returned after a release was created or overwritten.
 */
export type ReleaseRollback = () => Promise<void>

/**
 * Create or overwrite a GitLab release for a package tag.
 *
 * Skips the write when the tag has no message. Fetches the release for the
 * tag first: an existing release is overwritten with the generated content
 * via the update endpoint, and a missing release is created. Returns a
 * rollback callback that restores an overwritten release or deletes a
 * release created by this call.
 *
 * @param context Release context containing commit and prerelease information
 * @param plan Release plan containing the tag to publish
 * @param token GitLab authentication token
 * @param repository Target repository
 * @returns Promise that resolves to a rollback callback for the release, or
 * undefined when the write was skipped
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

  const api = new Gitlab({ token })

  const projectId = encodeURIComponent(`${repository.owner}/${repository.repo}`)

  const tagName = plan.release.tag.name

  const existing = await fetchRelease(api, projectId, tagName)

  if (existing) {
    await api.ProjectReleases.edit(projectId, tagName, {
      name: tagName,
      description: plan.release.tag.message,
    })

    context.logger.warn(
      `GitLab release for tag "${tagName}" already exists: its name and description were overwritten with the freshly generated content.`
    )

    return () => restoreRelease(plan, existing, token, repository)
  }

  await api.ProjectReleases.create(projectId, {
    name: tagName,
    tag_name: tagName,
    description: plan.release.tag.message,
    ref: context.commit.hash,
  })

  return () => deleteRelease(plan, token, repository)
}
