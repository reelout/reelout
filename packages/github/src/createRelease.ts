// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { Octokit } from '@octokit/rest'
import type { GitRepository, ReleaseContext, ReleasePlan } from '@reelout/core'
import { deleteRelease } from './deleteRelease'

/**
 * Rollback callback returned after a release was created or overwritten.
 */
export type ReleaseRollback = () => Promise<void>

/**
 * A GitHub release that already exists for a tag.
 */
interface ExistingRelease {
  /** Numeric id of the existing release. */
  id: number
  /** Release name as it existed before the overwrite. */
  name: string | null
  /** Release body as it existed before the overwrite. */
  body: string | null
}

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

async function fetchRelease(
  octokit: Octokit,
  repository: GitRepository,
  tagName: string
): Promise<ExistingRelease | null> {
  try {
    const { data: existing } = await octokit.rest.repos.getReleaseByTag({
      owner: repository.owner,
      repo: repository.repo,
      tag: tagName,
    })

    return { id: existing.id, name: existing.name, body: existing.body ?? null }
  } catch (err) {
    if ((err as { status?: number } | undefined)?.status !== 404) {
      throw err
    }

    return null
  }
}
