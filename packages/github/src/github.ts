// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { ReleaseContext, ReleasePlugin } from '@reelout/core'
import { version } from '../package.json'
import { createRelease, type ReleaseRollback } from './createRelease'
import { verifyToken } from './verifyToken'

/**
 * Read the GitHub token from the release environment.
 *
 * Treats unset and whitespace-only values as missing.
 *
 * @param env Release environment variables
 * @returns The trimmed token, or undefined when it is not set
 */
const readGitHubToken = (env: ReleaseContext['env']): string | undefined => {
  const token = env.GITHUB_TOKEN?.trim()

  return token ? token : undefined
}

/**
 * Built-in plugin that creates GitHub releases for finalized release plans.
 *
 * @remarks
 * **Lifecycle Stages:**
 * - `configure`: Leaves the plugin inactive when no GitHub-hosted repository
 *   was detected. Otherwise verifies the `GITHUB_TOKEN` environment variable:
 *   a missing token skips the plugin's `publish` step with a warning — or
 *   fails the run in strict mode — and a provided token is verified against
 *   the release repository so an invalid token fails before any mutation,
 *   including under dry-run.
 * - `publish`: Skips release creation when the plugin is inactive. Creates
 *   GitHub releases in reverse alphabetical package order (ensuring the root
 *   package release is created last), overwriting the name and notes of any
 *   existing release for a planned tag. Automatically rolls back when
 *   subsequent publishing stages fail: releases created by this run are
 *   deleted and overwritten releases are restored to their original content.
 *
 * @returns A release plugin configured for GitHub release creation.
 */
const github = (): ReleasePlugin => ({
  name: '@reelout/github',
  version,
  configure: async (context, next) => {
    const repository = context.repository

    if (repository?.host !== 'github') {
      context.logger.debug(
        'GitHub releases will not be created: no GitHub-hosted repository was detected.'
      )

      return next(context)
    }

    const token = readGitHubToken(context.env)

    if (!token) {
      if (context.strict) {
        throw new Error(
          'The GITHUB_TOKEN environment variable is required in strict mode.'
        )
      }

      context.logger.warn(
        'GitHub releases will not be created: GITHUB_TOKEN is not set.'
      )

      return next(context)
    }

    await verifyToken(token, repository)

    return next(context)
  },
  publish: async (context, next) => {
    if (context.repository?.host !== 'github') {
      context.logger.debug(
        'GitHub publishing was skipped: no GitHub-hosted repository was detected.'
      )

      return next(context)
    }

    const token = readGitHubToken(context.env)

    if (!token) {
      return next(context)
    }

    if (context.dryRun) {
      context.logger.debug('[DRY RUN] GitHub releases will not be created.')
      return next(context)
    }

    const plans = context.plans.toSorted((a, b) =>
      (a.package.name || '').localeCompare(b.package.name || '')
    )

    const repository = context.repository

    const rollbacks: ReleaseRollback[] = []

    // Create releases in reverse order
    // so that the root package release is created last,
    // as it is often the most important one.
    for (const plan of plans.toReversed()) {
      const rollback = await createRelease(context, plan, token, repository)

      if (rollback) {
        rollbacks.push(rollback)
      }
    }

    try {
      return await next(context)
    } catch (err) {
      await Promise.allSettled(rollbacks.map((rollback) => rollback()))

      throw err
    }
  },
})

export default github
