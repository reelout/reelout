// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { ReleaseContext, ReleasePlan, ReleasePlugin } from '@reelout/core'
import { version } from '../package.json'
import { createRelease } from './createRelease'
import { deleteRelease } from './deleteRelease'
import type { OriginalRelease } from './fetchRelease'
import { restoreRelease } from './restoreRelease'
import { verifyToken } from './verifyToken'

interface WrittenRelease {
  plan: ReleasePlan
  original: OriginalRelease | null
}

/**
 * Read the GitLab token from the release environment.
 *
 * Treats unset and whitespace-only values as missing.
 *
 * @param env Release environment variables
 * @returns The trimmed token, or undefined when it is not set
 */
const readGitlabToken = (env: ReleaseContext['env']): string | undefined => {
  const token = env.GITLAB_TOKEN?.trim()

  return token ? token : undefined
}

/**
 * Built-in plugin that creates GitLab releases for finalized release plans.
 *
 * @remarks
 * **Lifecycle Stages:**
 * - `configure`: Checks the `GITLAB_TOKEN` environment variable. A missing token skips GitLab release creation with a warning — or throws under strict mode — and a provided token is verified against the GitLab current-user endpoint so an invalid token fails before any mutation. Runs under dry-run.
 * - `publish`: Creates GitLab releases in reverse alphabetical package order (ensuring the root package release
 *   is created last), overwriting existing releases for the same tag. Automatically rolls back if subsequent
 *   publishing stages fail: releases created by this run are deleted, and overwritten releases are restored
 *   to their original content.
 *
 * @throws {Error} If `context.repository` is not configured, `GITLAB_TOKEN` is missing in strict mode, or a provided token fails verification.
 * @returns A release plugin configured for GitLab release creation.
 */
const gitlab = (): ReleasePlugin => ({
  name: '@reelout/gitlab',
  version,
  configure: async (context, next) => {
    const token = readGitlabToken(context.env)

    if (!token) {
      if (context.strict) {
        throw new Error(
          'The GITLAB_TOKEN environment variable is required in strict mode.'
        )
      }

      context.logger.warn(
        'GitLab releases will not be created: GITLAB_TOKEN is not set.'
      )

      return next(context)
    }

    await verifyToken(token)

    return next(context)
  },
  publish: async (context, next) => {
    if (!context.repository) {
      throw new Error(
        'A Git repository is required to create a GitLab release.'
      )
    }

    const token = readGitlabToken(context.env)

    if (!token) {
      return next(context)
    }

    if (context.dryRun) {
      context.logger.debug('[DRY RUN] GitLab releases will not be created.')
      return next(context)
    }

    const plans = context.plans.toSorted((a, b) =>
      (a.package.name || '').localeCompare(b.package.name || '')
    )

    const repository = context.repository

    const written: WrittenRelease[] = []

    // Create releases in reverse order
    // so that the root package release is created last,
    // as it is often the most important one.
    for (const plan of plans.toReversed()) {
      const result = await createRelease(context, plan, token, repository)

      if (result) {
        written.push({ plan, original: result.original })
      }
    }

    try {
      return await next(context)
    } catch (err) {
      // Roll back written releases in reverse creation order
      // so that the root package release is removed first.
      await Promise.allSettled(
        written
          .toReversed()
          .map(({ plan, original }) =>
            original
              ? restoreRelease(plan, original, token, repository)
              : deleteRelease(plan, token, repository)
          )
      )

      throw err
    }
  },
})

export default gitlab
