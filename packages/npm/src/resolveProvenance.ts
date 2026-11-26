// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { ReleaseContext } from '@reelout/core'
import { formatError } from '@reelout/core'
import * as github from '@reelout/github'
import * as gitlab from '@reelout/gitlab'
import { isSameRepository } from './isSameRepository'
import { resolveGitRepositoryFromPackage } from './resolveGitRepositoryFromPackage'

/**
 * Resolve the effective provenance setting for a publish.
 *
 * Returns the explicit option unchanged and otherwise detects provenance
 * from the root package manifest's repository: when it is valid, matches
 * the context repository, and its host reports it as public through
 * `GITHUB_TOKEN` or `GITLAB_TOKEN`, provenance is enabled, while private,
 * unmatched, or unverifiable repositories leave it unset.
 *
 * @param context Release context containing environment, repository, and
 * working directory
 * @param explicit The explicit `provenance` plugin option, when configured
 * @returns Whether provenance is enabled, or undefined when it stays unset
 */
export async function resolveProvenance(
  context: ReleaseContext,
  explicit?: boolean | undefined
): Promise<boolean | undefined> {
  if (explicit != null) {
    return explicit
  }

  try {
    const repo = await resolveGitRepositoryFromPackage(context.cwd)

    if (
      repo &&
      context.repository &&
      isSameRepository(repo, context.repository)
    ) {
      if (repo.host === 'github' && context.env.GITHUB_TOKEN) {
        return await github.isRepositoryPublic(context.env.GITHUB_TOKEN, repo)
      }

      if (repo.host === 'gitlab' && context.env.GITLAB_TOKEN) {
        return await gitlab.isRepositoryPublic(context.env.GITLAB_TOKEN, repo)
      }
    }
  } catch (error) {
    context.logger.debug(
      `Provenance could not be resolved from the package repository: ${formatError(error)}`
    )
  }

  return undefined
}
