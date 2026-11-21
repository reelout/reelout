// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { Gitlab } from '@gitbeaker/rest'
import type { GitRepository } from '@reelout/core'

/**
 * Verify that a GitLab token can access the project it releases to.
 *
 * Performs the token pre-flight for the GitLab plugin by reading the target
 * project, so a provided-but-invalid or expired token fails during the
 * configure stage, before any release is created. The project is read
 * instead of the current user because tokens scoped to a project or a CI
 * job are not always permitted to read the current user while still being
 * able to create releases for the project. The check runs identically
 * under dry-run.
 *
 * @param token GitLab authentication token
 * @param repository Target repository
 * @returns A promise that resolves when GitLab accepts the token
 * @throws If reading the project fails, carrying the original error as the cause
 */
export async function verifyToken(
  token: string,
  repository: GitRepository
): Promise<void> {
  const api = new Gitlab({ token })

  const projectId = encodeURIComponent(`${repository.owner}/${repository.repo}`)

  try {
    await api.Projects.show(projectId)
  } catch (err) {
    throw new Error(
      'The GITLAB_TOKEN environment variable could not be verified.',
      { cause: err }
    )
  }
}
