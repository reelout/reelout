// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import {
  filterPackages,
  formatError,
  normalizeWorkspace,
  sortPackages,
  type Package,
  type ReleasePlugin,
  type Workspace,
} from '@reelout/core'
import * as github from '@reelout/github'
import * as gitlab from '@reelout/gitlab'
import { colors } from 'consola/utils'
import { version } from '../package.json'
import { bumpPackageDependencies } from './bumpPackageDependencies'
import { isSameRepository } from './isSameRepository'
import { loadPackages } from './loadPackages'
import { publishPackage } from './publishPackage'
import { resolveGitRepositoryFromPackage } from './resolveGitRepositoryFromPackage'
import { resolveWorkspaceMembers } from './resolveWorkspaceMembers'
import type { PublishAccess } from './types'
import { verifyAuth } from './verifyAuth'

export const PLUGIN_NAME = '@reelout/npm'

export interface PluginOptions {
  workspace?: Partial<Workspace>
  access?: PublishAccess | null | undefined
  provenance?: boolean | undefined
  stage?: boolean | undefined
}

/**
 * Built-in plugin that discovers workspace packages, updates package manifests, and publishes packages to NPM.
 *
 * @remarks
 * **Lifecycle Stages:**
 * - `configure`: Resolves and attaches Git repository metadata from root package configuration, then verifies
 *   registry authentication, failing in strict mode or recording a skipped publish step when no credentials exist.
 * - `discover`: Discovers workspace member packages, filters them against the `filter` patterns, and loads package metadata into context.
 * - `write`: Bumps internal workspace dependency versions in `package.json` files (skipped in dry-run).
 * - `publish`: Authenticates and publishes non-private packages to NPM, enabling provenance when
 *   the manifest repository is valid, matches the context repository, and is public. Skips entirely
 *   when configure-stage verification found no registry authentication.
 *
 * @param options Configuration options for NPM workspace discovery and publishing behavior.
 * @returns A release plugin configured for NPM workspace management and package publication.
 */
const npm = (options: PluginOptions = {}): ReleasePlugin => {
  let skippedForMissingAuth = false

  return {
    name: PLUGIN_NAME,
    version,
    configure: async (context, next) => {
      const repo = await resolveGitRepositoryFromPackage(context.cwd)
      context.repository = repo ?? context.repository

      const authKind = await verifyAuth(context)

      if (authKind === 'none') {
        if (context.strict) {
          throw new Error(
            'NPM_TOKEN is required for NPM authentication in strict mode.'
          )
        }

        context.skippedSteps.push({
          plugin: PLUGIN_NAME,
          hook: 'publish',
          reason: 'NPM_TOKEN is required for NPM authentication.',
        })

        context.logger.warn(
          colors.yellow(
            'Packages will not be published: NPM_TOKEN is required for NPM authentication.'
          )
        )

        skippedForMissingAuth = true
      }

      return next(context)
    },
    discover: async (context, next) => {
      const packages: Package[] = []

      const workspace = normalizeWorkspace(context.cwd, options.workspace)

      workspace.members ??= await resolveWorkspaceMembers(context.cwd)

      for (const result of await loadPackages(context.cwd, workspace)) {
        if (result.status === 'fulfilled') {
          packages.push({
            ...result.value,
            provider: PLUGIN_NAME,
          })
        } else {
          context.logger.warn(
            colors.yellow(
              `Package could not be loaded: ${formatError(result.reason)}`
            )
          )
        }
      }

      context.packages = sortPackages(
        filterPackages(context.packages.concat(packages), context.filter)
      )

      return next(context)
    },
    write: async (context, next) => {
      if (context.dryRun) {
        context.logger.debug('[DRY RUN] Package files will not be updated.')
      } else {
        await bumpPackageDependencies(
          context.cwd,
          context.plans.filter((plan) => plan.package.provider === PLUGIN_NAME)
        )
      }

      return next(context)
    },
    publish: async (context, next) => {
      if (skippedForMissingAuth) {
        context.logger.debug(
          'NPM publishing was skipped: no registry authentication was found.'
        )

        return next(context)
      }

      let { provenance } = options

      try {
        if (provenance == null) {
          const repo = await resolveGitRepositoryFromPackage(context.cwd)

          if (
            repo &&
            context.repository &&
            isSameRepository(repo, context.repository)
          ) {
            if (repo.host === 'github' && context.env.GITHUB_TOKEN) {
              provenance = await github.isRepositoryPublic(
                context.env.GITHUB_TOKEN,
                repo
              )
            }

            if (repo.host === 'gitlab' && context.env.GITLAB_TOKEN) {
              provenance = await gitlab.isRepositoryPublic(
                context.env.GITLAB_TOKEN,
                repo
              )
            }
          }
        }
      } catch {}

      for (const plan of context.plans) {
        if (plan.package.provider === PLUGIN_NAME) {
          await publishPackage(context, plan, {
            dryRun: context.dryRun,
            tag: context.releaseChannel,
            access: options.access,
            provenance,
            stage: options.stage,
          })
        }
      }

      return next(context)
    },
  }
}

export default npm
