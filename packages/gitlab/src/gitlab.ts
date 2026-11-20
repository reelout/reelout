// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { ReleasePlugin } from '@reelout/core'
import { version } from '../package.json'
import { createRelease } from './createRelease'
import { deleteRelease } from './deleteRelease'
import { verifyToken } from './verifyToken'

const MISSING_TOKEN_REASON =
  'GitLab releases were not created: GITLAB_TOKEN is required for GitLab authentication.'

/**
 * Built-in plugin that creates GitLab releases for finalized release plans.
 *
 * @remarks
 * **Lifecycle Stages:**
 * - `configure`: Checks the `GITLAB_TOKEN` environment variable. A missing token skips GitLab release creation with a warning — or throws under strict mode — and a provided token is verified against the GitLab current-user endpoint so an invalid token fails before any mutation. Runs under dry-run.
 * - `publish`: Creates GitLab releases in reverse alphabetical package order (ensuring the root package release
 *   is created last). Automatically rolls back and deletes created releases if subsequent publishing stages fail.
 *
 * @throws {Error} If `context.repository` is not configured, `GITLAB_TOKEN` is missing in strict mode, or a provided token fails verification.
 * @returns A release plugin configured for GitLab release creation.
 */
const gitlab = (): ReleasePlugin => ({
  name: '@reelout/gitlab',
  version,
  configure: async (context, next) => {
    const token = context.env.GITLAB_TOKEN?.trim()

    if (!token) {
      if (context.strict) {
        throw new Error('The GITLAB_TOKEN environment variable is required.')
      }

      context.skippedSteps.push({
        plugin: '@reelout/gitlab',
        hook: 'publish',
        reason: MISSING_TOKEN_REASON,
      })

      context.logger.warn(MISSING_TOKEN_REASON)

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

    const token = context.env.GITLAB_TOKEN?.trim()

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

    // Create releases in reverse order
    // so that the root package release is created last,
    // as it is often the most important one.
    for (const plan of plans.toReversed()) {
      await createRelease(context, plan, token, repository)
    }

    try {
      return await next(context)
    } catch (err) {
      await Promise.allSettled(
        plans.map((plan) => deleteRelease(plan, token, repository))
      )

      throw err
    }
  },
})

export default gitlab
