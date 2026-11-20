// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { Octokit } from '@octokit/rest'
import type { GitRepository, ReleaseContext, ReleasePlan } from '@reelout/core'
import { deleteRelease } from './deleteRelease'

/**
 * Rollback callback returned after a release was created or overwritten.
 */
export type ReleaseRollback = () => Promise<void>

const noopRollback: ReleaseRollback = async () => {}

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
 * @returns Promise that resolves to a rollback callback for the release
 */
export async function createRelease(
  context: ReleaseContext,
  plan: ReleasePlan,
  token: string,
  repository: GitRepository
): Promise<ReleaseRollback> {
  if (!plan.release?.tag?.message) {
    return noopRollback
  }

  const { name: tagName, message } = plan.release.tag

  /* istanbul ignore next */
  const octokit = new Octokit({
    auth: token,
    log: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
  })

  try {
    const { data: existing } = await octokit.rest.repos.getReleaseByTag({
      owner: repository.owner,
      repo: repository.repo,
      tag: tagName,
    })

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

    const original = {
      id: existing.id,
      name: existing.name,
      body: existing.body ?? null,
    }

    return async () => {
      await octokit.rest.repos.updateRelease({
        owner: repository.owner,
        repo: repository.repo,
        release_id: original.id,
        // The API accepts null to clear a field, but Octokit's types forbid it.
        name: original.name as string,
        body: original.body as string,
      })
    }
  } catch (err) {
    if ((err as { status?: number } | undefined)?.status !== 404) {
      throw err
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
