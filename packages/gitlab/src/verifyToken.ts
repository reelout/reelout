// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { Gitlab } from '@gitbeaker/rest'

/**
 * Verify that a GitLab token is alive by fetching the authenticated user.
 *
 * Performs the Gitbeaker current-user request so a provided-but-invalid or
 * expired token fails during the configure stage, before any release is
 * created. The check runs identically under dry-run.
 *
 * @param token GitLab authentication token
 * @throws If the current-user request fails, carrying the original error as the cause
 */
export async function verifyToken(token: string): Promise<void> {
  const api = new Gitlab({ token })

  try {
    await api.Users.showCurrentUser()
  } catch (err) {
    throw new Error(
      'The GITLAB_TOKEN environment variable could not be verified.',
      { cause: err }
    )
  }
}
