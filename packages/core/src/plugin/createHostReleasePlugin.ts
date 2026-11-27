// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type {
  GitRepository,
  ReleaseContext,
  ReleasePlan,
  ReleasePlugin,
} from '../types'
import { formatError } from '../util/formatError'

/**
 * Read the release token from the release environment.
 *
 * Treats unset and whitespace-only values as missing.
 *
 * @param env Release environment variables
 * @param tokenEnvKey Environment variable holding the release token
 * @returns The trimmed token, or undefined when it is not set
 */
const readToken = (
  env: ReleaseContext['env'],
  tokenEnvKey: string
): string | undefined => {
  const token = env[tokenEnvKey]?.trim()

  return token ? token : undefined
}

/**
 * Options for {@link createHostReleasePlugin}.
 */
export interface HostReleasePluginOptions {
  /**
   * Plugin name reported to the workflow, such as `'@reelout/github'`.
   */
  name: string

  /**
   * Plugin version reported to the workflow.
   */
  version: string

  /**
   * Repository host the plugin publishes to, such as `'github'`. Compared
   * against the `host` of the release repository, so custom hosts are
   * supported as long as the repository detection reports them.
   */
  host: string

  /**
   * Human-readable host name used in log messages, such as `'GitHub'`.
   */
  displayName: string

  /**
   * Environment variable holding the release token, such as
   * `'GITHUB_TOKEN'`.
   */
  tokenEnvKey: string

  /**
   * Verify the release token against the target repository.
   *
   * Runs during the `configure` stage so a provided-but-invalid token fails
   * before any mutation, including under dry-run.
   *
   * @param token Release token
   * @param repository Target repository
   */
  verifyToken: (token: string, repository: GitRepository) => Promise<void>

  /**
   * Create the host release for a release plan.
   *
   * Runs during the `publish` stage for each finalized plan.
   *
   * @param context Release context
   * @param plan Release plan to publish
   * @param token Release token
   * @param repository Target repository
   * @returns Promise that resolves to a rollback callback for the release,
   * or undefined when creation was skipped
   */
  createRelease: (
    context: ReleaseContext,
    plan: ReleasePlan,
    token: string,
    repository: GitRepository
  ) => Promise<(() => Promise<void>) | void>
}

/**
 * Run the collected release rollbacks, logging individual rollback failures
 * without aborting the remaining rollbacks.
 *
 * @param logger Logger used to report rollback failures
 * @param displayName Human-readable host name used in log messages
 * @param rollbacks Rollback callbacks collected during publishing
 */
const rollbackReleases = async (
  logger: ReleaseContext['logger'],
  displayName: string,
  rollbacks: (() => Promise<void>)[]
): Promise<void> => {
  const results = await Promise.allSettled(
    rollbacks.map((rollback) => rollback())
  )

  for (const result of results) {
    if (result.status === 'rejected') {
      logger.error(
        `A ${displayName} release could not be rolled back: ${formatError(result.reason)}`
      )
    }
  }
}

/**
 * Create a built-in plugin that publishes releases to a git host.
 *
 * Produces the shared skeleton behind the host release plugins. The plugin
 * stays inactive unless the release repository is hosted on the given host,
 * and verifies the token during the `configure` stage: a missing token
 * skips the plugin's `publish` step with a warning — or fails the run in
 * strict mode — and a provided token is verified against the release
 * repository before any mutation. During `publish`, host releases are
 * created in reverse alphabetical package order (ensuring the root package
 * release is created last) and rolled back when subsequent publishing
 * stages fail.
 *
 * @param options Host release plugin options
 * @returns A release plugin configured for the given host
 */
export function createHostReleasePlugin(
  options: HostReleasePluginOptions
): ReleasePlugin {
  return {
    name: options.name,
    version: options.version,
    configure: async (context, next) => {
      const repository = context.repository

      if (repository?.host !== options.host) {
        context.logger.debug(
          `${options.displayName} releases will not be created: no ${options.displayName}-hosted repository was detected.`
        )

        return next(context)
      }

      const token = readToken(context.env, options.tokenEnvKey)

      if (!token) {
        if (context.strict) {
          throw new Error(
            `The ${options.tokenEnvKey} environment variable is required in strict mode.`
          )
        }

        context.logger.debug(
          `${options.displayName} releases will not be created: ${options.tokenEnvKey} is not set.`
        )

        return next(context)
      }

      await options.verifyToken(token, repository)

      return next(context)
    },
    publish: async (context, next) => {
      if (context.repository?.host !== options.host) {
        context.logger.debug(
          `${options.displayName} publishing was skipped: no ${options.displayName}-hosted repository was detected.`
        )

        return next(context)
      }

      const token = readToken(context.env, options.tokenEnvKey)

      if (!token) {
        return next(context)
      }

      if (context.dryRun) {
        context.logger.debug(
          `[DRY RUN] ${options.displayName} releases will not be created.`
        )

        return next(context)
      }

      const plans = context.plans.toSorted((a, b) =>
        (a.package.name || '').localeCompare(b.package.name || '')
      )

      const repository = context.repository

      const rollbacks: (() => Promise<void>)[] = []

      try {
        // Create releases in reverse order
        // so that the root package release is created last,
        // as it is often the most important one.
        for (const plan of plans.toReversed()) {
          const rollback = await options.createRelease(
            context,
            plan,
            token,
            repository
          )

          if (rollback) {
            rollbacks.push(rollback)
          }
        }
      } catch (err) {
        await rollbackReleases(context.logger, options.displayName, rollbacks)

        throw err
      }

      try {
        return await next(context)
      } catch (err) {
        await rollbackReleases(context.logger, options.displayName, rollbacks)

        throw err
      }
    },
  }
}
