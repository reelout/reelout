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
import { colors } from 'consola/utils'
import { version } from '../package.json'
import { bumpPackageDependencies } from './bumpPackageDependencies'
import { hasPackageManifest } from './hasPackageManifest'
import { inspectPackageManager } from './inspectPackageManager'
import { isCompleteReleasePlan } from './isCompleteReleasePlan'
import { loadPackages } from './loadPackages'
import { PLUGIN_NAME } from './PLUGIN_NAME'
import { probeReleasePlan } from './probeReleasePlan'
import type { PublishPackageOptions } from './publishPackage'
import { publishPlans } from './publishPlans'
import { resolveGitRepositoryFromPackage } from './resolveGitRepositoryFromPackage'
import { resolveProvenance } from './resolveProvenance'
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
 *   no root `package.json` or Yarn is the active package manager. Otherwise
 *   resolves and attaches Git repository metadata from root package
 *   configuration, then verifies registry authentication, failing in strict
 *   mode or skipping the publish phase when no credentials exist.
 * - `discover`: Skips discovery when the plugin is inactive. Discovers
 *   workspace member packages, filters them against the `filter` patterns,
 *   and loads package metadata into context.
 * - `write`: Skips manifest updates when the plugin is inactive. Bumps
 *   internal workspace dependency versions in `package.json` files (skipped
 *   in dry-run).
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
 *   found, Yarn is the active package manager, or configure-stage
 *   verification found no registry authentication.
 *
 * @param options Configuration options for NPM workspace discovery and publishing behavior.
 * @returns A release plugin configured for NPM workspace management and package publication.
 */
const npm = (options: PluginOptions = {}): ReleasePlugin => {
  let inactive = false

  let publishSkipped = false

  return {
    name: PLUGIN_NAME,
    version,
    configure: async (context, next) => {
      if (!(await hasPackageManifest(context.cwd))) {
        context.logger.debug(
          `NPM workspace could not be found at "${context.cwd}".`
        )

        return next(context)
      }

      const packageManager = await inspectPackageManager(
        context.cwd,
        {
          env: context.env,
        },
        context.logger
      )

      if (packageManager.isYarn) {
        inactive = true

        context.logger.debug(
          'NPM plugin is inactive: Yarn is the active package manager.'
        )

        return next(context)
      }

      const repo = await resolveGitRepositoryFromPackage(context.cwd)
      context.repository = repo ?? context.repository

      const authKind = await verifyAuth(context, packageManager)

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
      if (inactive || !(await hasPackageManifest(context.cwd))) {
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
      if (inactive || !(await hasPackageManifest(context.cwd))) {
        return next(context)
      }

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
      if (inactive) {
        context.logger.debug(
          'NPM plugin is inactive: Yarn is the active package manager.'
        )

        return next(context)
      }

      if (!(await hasPackageManifest(context.cwd))) {
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

      const provenance = await resolveProvenance(context, options.provenance)

      const publishable = context.plans.filter((plan) =>
        isCompleteReleasePlan(plan)
      )

      const packageManager =
        publishable.length > 0
          ? await inspectPackageManager(
              context.cwd,
              { env: context.env },
              context.logger
            )
          : undefined

      const skipped = new Set<ReleasePlan>()

      if (packageManager) {
        const trustedPublishing = await verifyTrustedPublishing(
          context,
          publishable,
          packageManager
        )

        await verifyPublishAccess(
          context,
          publishable,
          packageManager,
          PLUGIN_NAME,
          trustedPublishing
        )

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

      const staged = await publishPlans(
        context,
        PLUGIN_NAME,
        packageManager,
        publishOptions,
        skipped
      )

      if (packageManager !== undefined && staged.length > 0) {
        const targets = staged
          .map((plan) => `"${plan.package.name}@${plan.release.version}"`)
          .join(', ')

        let stageCommand = 'npm stage'

        if (packageManager.isPnpm) {
          stageCommand = 'pnpm stage'
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
