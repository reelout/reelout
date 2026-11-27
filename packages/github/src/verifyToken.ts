// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { GitRepository } from '@reelout/core'
import { createOctokit } from './createOctokit'

/**
 * Verify that a GitHub token can access the repository it releases to.
 *
 * Performs the token pre-flight for the GitHub plugin by reading the target
 * repository, so a provided-but-invalid token fails before any release is
 * created. The repository is read instead of the authenticated user because
 * the installation-scoped `GITHUB_TOKEN` provided by GitHub Actions is
 * forbidden from reading the authenticated user while still being able to
 * create releases for the repository.
 *
 * @param token GitHub authentication token
 * @param repository Target repository
 * @returns A promise that resolves when GitHub accepts the token
 * @throws If GitHub rejects the token while reading the repository
 */
export async function verifyToken(
  token: string,
  repository: GitRepository
): Promise<void> {
  const octokit = createOctokit(token)

  try {
    await octokit.rest.repos.get({
      owner: repository.owner,
      repo: repository.repo,
    })
  } catch (err) {
    throw new Error(
      'The GITHUB_TOKEN environment variable could not be verified.',
      { cause: err }
    )
  }
}
