// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { Gitlab } from '@gitbeaker/rest'
import type { GitRepository, ReleasePlan } from '@reelout/core'
import type { OriginalRelease } from './createRelease'

/**
 * Restore an overwritten GitLab release to its original content.
 *
 * Reapplies the captured original name and description via the update
 * endpoint. Skips the restore when the plan does not contain a valid tag
 * name.
 *
 * @param plan Release plan containing the tag associated with the release to restore
 * @param original Original release content captured before the overwrite
 * @param token GitLab authentication token
 * @param repository Target repository
 * @returns Promise that resolves when the release is restored
 */
export async function restoreRelease(
  plan: ReleasePlan,
  original: OriginalRelease,
  token: string,
  repository: GitRepository
): Promise<void> {
  if (!plan.release?.tag?.name) {
    return
  }

  const api = new Gitlab({ token })

  const projectId = encodeURIComponent(`${repository.owner}/${repository.repo}`)

  await api.ProjectReleases.edit(projectId, plan.release.tag.name, {
    name: original.name,
    description: original.description,
  })
}
