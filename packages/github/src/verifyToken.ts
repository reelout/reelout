// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { Octokit } from '@octokit/rest'

/**
 * Verify that a GitHub token is accepted by fetching the authenticated user.
 *
 * Performs the token-aliveness pre-flight for the GitHub plugin so a
 * provided-but-invalid token fails before any release is created.
 *
 * @param token GitHub authentication token
 * @returns A promise that resolves when GitHub accepts the token
 * @throws If GitHub rejects the token while fetching the authenticated user
 */
export async function verifyToken(token: string): Promise<void> {
  /* istanbul ignore next */
  const octokit = new Octokit({
    auth: token,
    log: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
  })

  try {
    await octokit.rest.users.getAuthenticated()
  } catch (err) {
    throw new Error(
      'The GITHUB_TOKEN environment variable could not be verified.',
      { cause: err }
    )
  }
}
