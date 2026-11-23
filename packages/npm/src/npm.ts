// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import {
  filterPackages,
  formatError,
  normalizeWorkspace,
  sortPackages,
  type Package,
  type ReleasePlan,
  type ReleasePlugin,
  type Workspace,
} from '@reelout/core'
import * as github from '@reelout/github'
import * as gitlab from '@reelout/gitlab'
import { colors } from 'consola/utils'
import { version } from '../package.json'
import { bumpPackageDependencies } from './bumpPackageDependencies'
import { fallbackToStagedPublish } from './fallbackToStagedPublish'
import { hasPackageManifest } from './hasPackageManifest'
import { inspectPackageManager } from './inspectPackageManager'
import {
  isCompleteReleasePlan,
  type CompleteReleasePlan,
} from './isCompleteReleasePlan'
import { isPublishOverRejection } from './isPublishOverRejection'
import { isSameRepository } from './isSameRepository'
import { isStageRequiredRejection } from './isStageRequiredRejection'
import { loadPackages } from './loadPackages'
import { PLUGIN_NAME } from './PLUGIN_NAME'
import { probeReleasePlan } from './probeReleasePlan'
import { publishPackage, type PublishPackageOptions } from './publishPackage'
import { recoverFromPublishOverRejection } from './recoverFromPublishOverRejection'
import { resolveGitRepositoryFromPackage } from './resolveGitRepositoryFromPackage'
import { resolveWorkspaceMembers } from './resolveWorkspaceMembers'
import type { PublishAccess } from './types'
import { verifyPublishAccess } from './verifyPublishAccess'
import { verifyAuth } from './verifyAuth'
import { verifyTrustedPublishing } from './verifyTrustedPublishing'

export { PLUGIN_NAME }

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
 * - `configure`: Leaves the plugin inactive when the working directory holds
 *   no root `package.json`. Otherwise resolves and attaches Git repository
 *   metadata from root package configuration, then verifies
 *   registry authentication, failing in strict mode or skipping the publish
 *   phase when no credentials exist.
 * - `discover`: Skips discovery when the plugin is inactive. Discovers
 *   workspace member packages, filters them against the `filter` patterns,
 *   and loads package metadata into context.
 * - `write`: Bumps internal workspace dependency versions in `package.json` files (skipped in dry-run).
 * - `publish`: For OIDC-authenticated npm or pnpm releases targeting the
 *   public npm registry, verifies trusted publishing through the registry's
 *   token exchange before anything is published, failing when the registry
 *   rejects it. Verifies each publishable package's publish permission
 *   against its resolved registry, failing when access is definitively
 *   missing and warning when it cannot be confirmed. Then authenticates and
 *   probes each publishable package version before publishing, skipping
 *   versions the registry already holds with identical content (syncing
 *   their dist-tags) and failing on different or unverifiable content.
 *   Publishes non-private packages to NPM, enabling provenance when the
 *   manifest repository is valid, matches the context repository, and is
 *   public. Falls back to staged publishing when the registry rejects a
 *   direct publish with a staged-publishing requirement and the `stage`
 *   option does not disable the fallback, summarizing the staged
 *   publications at the end. Skips entirely when no NPM workspace was
 *   found or configure-stage verification found no registry
 *   authentication.
 *
 * @param options Configuration options for NPM workspace discovery and publishing behavior.
 * @returns A release plugin configured for NPM workspace management and package publication.
 */
const npm = (options: PluginOptions = {}): ReleasePlugin => {
  let publishSkipped = false

  return {
    name: PLUGIN_NAME,
    version,
    configure: async (context, next) => {
      if (!(await hasPackageManifest(context.cwd))) {
        context.inactivePlugins.add(PLUGIN_NAME)

        context.logger.debug(
          `NPM workspace could not be found at "${context.cwd}".`
        )

        return next(context)
      }

      const repo = await resolveGitRepositoryFromPackage(context.cwd)
      context.repository = repo ?? context.repository

      const authKind = await verifyAuth(context)

      if (authKind === 'none') {
        if (context.strict) {
          throw new Error(
            'NPM_TOKEN is required for NPM authentication in strict mode.'
          )
        }

        publishSkipped = true

        context.logger.warn(
          colors.yellow(
            'Packages will not be published: NPM_TOKEN is required for NPM authentication.'
          )
        )
      }

      return next(context)
    },
    discover: async (context, next) => {
      if (context.inactivePlugins.has(PLUGIN_NAME)) {
        return next(context)
      }

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
      if (context.inactivePlugins.has(PLUGIN_NAME)) {
        context.logger.debug(
          'NPM publishing was skipped: no NPM workspace was found.'
        )

        return next(context)
      }

      if (publishSkipped) {
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

      const publishable = context.plans.filter(isCompleteReleasePlan)

      const packageManager =
        publishable.length > 0
          ? await inspectPackageManager(context.cwd, { env: context.env })
          : undefined

      const skipped = new Set<ReleasePlan>()

      if (packageManager) {
        await verifyTrustedPublishing(context, publishable, packageManager)

        await verifyPublishAccess(context, publishable, packageManager)

        for (const plan of publishable) {
          await probeReleasePlan(context, plan, packageManager, skipped)
        }
      }

      const publishOptions: PublishPackageOptions = {
        dryRun: context.dryRun,
        tag: context.releaseChannel,
        access: options.access,
        provenance,
        stage: options.stage,
      }

      const staged: CompleteReleasePlan[] = []

      for (const plan of context.plans) {
        if (plan.package.provider !== PLUGIN_NAME || skipped.has(plan)) {
          continue
        }

        try {
          await publishPackage(context, plan, publishOptions)
        } catch (error) {
          if (packageManager === undefined || !isCompleteReleasePlan(plan)) {
            throw error
          }

          if (isStageRequiredRejection(error)) {
            if (
              await fallbackToStagedPublish(
                context,
                plan,
                packageManager,
                publishOptions,
                error
              )
            ) {
              staged.push(plan)
            } else {
              throw error
            }
          } else if (isPublishOverRejection(error)) {
            await recoverFromPublishOverRejection(
              context,
              plan,
              packageManager,
              error
            )
          } else {
            throw error
          }
        }
      }

      if (packageManager !== undefined && staged.length > 0) {
        const targets = staged
          .map((plan) => `"${plan.package.name}@${plan.release.version}"`)
          .join(', ')

        let stageCommand = 'npm stage'

        if (packageManager.isPnpm) {
          stageCommand = 'pnpm stage'
        } else if (packageManager.isYarnBerry) {
          stageCommand = 'yarn npm stage'
        }

        context.logger.warn(
          colors.yellow(
            `Packages were staged instead of published: ${targets}. Review the staged publications with "${stageCommand} list" and finish the release with "${stageCommand} approve <stage-id>".`
          )
        )
      }

      return next(context)
    },
  }
}

export default npm
