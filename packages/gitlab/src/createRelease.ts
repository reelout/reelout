// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { Gitlab } from '@gitbeaker/rest'
import type { GitRepository, ReleaseContext, ReleasePlan } from '@reelout/core'
import { fetchRelease, type OriginalRelease } from './fetchRelease'

/**
 * Create or overwrite a GitLab release for a package tag.
 *
 * Skips the write when the tag has no message. Fetches the release for the
 * tag first: an existing release is overwritten with the generated content
 * via the update endpoint — capturing its original name and description for
 * rollback — and a missing release is created.
 *
 * @param context Release context containing commit and prerelease information
 * @param plan Release plan containing the tag to publish
 * @param token GitLab authentication token
 * @param repository Target repository
 * @returns Promise resolving to `{ original: OriginalRelease }` when an
 * existing release was overwritten, `{ original: null }` when the release was
 * created, or `null` when the write was skipped
 */
export async function createRelease(
  context: ReleaseContext,
  plan: ReleasePlan,
  token: string,
  repository: GitRepository
): Promise<{ original: OriginalRelease | null } | null> {
  if (!plan.release?.tag?.message) {
    return null
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
      `An existing GitLab release for "${tagName}" was overwritten.`
    )

    return { original: existing }
  }

  await api.ProjectReleases.create(projectId, {
    name: tagName,
    tag_name: tagName,
    description: plan.release.tag.message,
    ref: context.commit.hash,
  })

  return { original: null }
}
