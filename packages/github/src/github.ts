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
 * - `configure`: Verifies the `GITHUB_TOKEN` environment variable is present and
 *   able to access the release repository. Skips the pre-flight when repository
 *   context is unavailable. In strict mode a missing token fails the run;
 *   otherwise the plugin's `publish` step is skipped and a warning is logged.
 * - `publish`: Creates GitHub releases in reverse alphabetical package order (ensuring the root
 *   package release is created last). Overwrites the name and notes of an existing release for a
 *   planned tag. Automatically rolls back — restoring overwritten releases and deleting created
 *   ones — if subsequent publishing stages fail.
 *
 * @returns A release plugin configured for GitHub release creation.
 */
const github = (): ReleasePlugin => ({
  name: '@reelout/github',
  version,
  configure: async (context, next) => {
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

    if (context.repository) {
      await verifyToken(token, context.repository)
    }

    return next(context)
  },
  publish: async (context, next) => {
    if (!context.repository) {
      throw new Error(
        'A Git repository is required to create a GitHub release.'
      )
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
