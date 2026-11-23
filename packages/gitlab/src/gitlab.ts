// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { ReleaseContext, ReleasePlugin } from '@reelout/core'
import { version } from '../package.json'
import { createRelease, type ReleaseRollback } from './createRelease'
import { verifyToken } from './verifyToken'

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
 * - `configure`: Leaves the plugin inactive when the repository is not hosted
 *   on GitLab. Otherwise checks the `GITLAB_TOKEN` environment variable. A
 *   missing token skips GitLab release creation with a warning — or throws
 *   under strict mode — and a provided token is verified against the release
 *   project so an invalid token fails before any mutation. Runs under
 *   dry-run.
 * - `publish`: Skips release creation when the plugin is inactive. Creates
 *   GitLab releases in reverse alphabetical package order (ensuring the
 *   root package release is created last), overwriting existing releases
 *   for the same tag. Automatically rolls back if subsequent publishing
 *   stages fail: releases created by this run are deleted, and overwritten
 *   releases are restored to their original content.
 *
 * @returns A release plugin configured for GitLab release creation.
 */
const gitlab = (): ReleasePlugin => {
  return {
    name: '@reelout/gitlab',
    version,
    configure: async (context, next) => {
      const repository = context.repository

      if (repository?.host !== 'gitlab') {
        context.inactivePlugins.add('@reelout/gitlab')

        context.logger.debug(
          'GitLab releases will not be created: the repository is not hosted on GitLab.'
        )

        return next(context)
      }

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

      await verifyToken(token, repository)

      return next(context)
    },
    publish: async (context, next) => {
      if (context.inactivePlugins.has('@reelout/gitlab')) {
        context.logger.debug(
          'GitLab publishing was skipped: the repository is not hosted on GitLab.'
        )

        return next(context)
      }

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
  }
}

export default gitlab
