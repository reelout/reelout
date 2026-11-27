// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import {
  filterPackages,
  formatError,
  sortPackages,
  type Package,
  type ReleasePlan,
  type ReleasePlugin,
} from '@reelout/core'
import { colors } from 'consola/utils'
import { version } from '../package.json'
import { bumpCargoManifests } from './bumpCargoManifests'
import { hasCargoCommand } from './hasCargoCommand'
import { hasCargoManifest } from './hasCargoManifest'
import { isCompleteReleasePlan } from './isCompleteReleasePlan'
import { isPublishOverRejection } from './isPublishOverRejection'
import { loadCargoPackages } from './loadCargoPackages'
import { PLUGIN_NAME } from './PLUGIN_NAME'
import { probeCrateReleasePlan } from './probeCrateReleasePlan'
import { publishCrate } from './publishCrate'
import { recoverFromCratePublishOverRejection } from './recoverFromCratePublishOverRejection'
import { refreshCargoLock } from './refreshCargoLock'
import { resolveCargoToken } from './resolveCargoToken'
import { resolveGitRepositoryFromCargoManifest } from './resolveGitRepositoryFromCargoManifest'
import { createSparseIndexClient } from './sparseIndex'
import { verifyRegistryToken } from './verifyRegistryToken'
import { verifyPublishAccess } from './verifyPublishAccess'
import {
  hasTrustedPublishingAuth,
  verifyTrustedPublishing,
} from './verifyTrustedPublishing'

/** The verified registry credentials of a release. */
interface RegistryAuth {
  token: string
  login: string
}

/**
 * Configuration options for the Cargo release plugin.
 */
export interface PluginOptions {
  /**
   * Pass `--allow-dirty` to `cargo publish` so working trees with
   * uncommitted changes can still be published.
   */
  allowDirty?: boolean | undefined

  /**
   * Pass `--no-verify` to `cargo publish` to skip the verification build
   * of the crate before it is published.
   */
  noVerify?: boolean | undefined
}

/**
 * Built-in plugin that discovers Cargo workspaces, updates crate
 * manifests, refreshes the lockfile, and publishes crates to crates.io.
 *
 * @remarks
 * **Lifecycle Stages:**
 * - `configure`: Resolves and attaches Git repository metadata from the
 *   root Cargo manifest, verifies the crates.io registry token, and checks
 *   the `cargo` command, failing in strict mode or skipping the publish
 *   phase when credentials or the command are missing. Falls back to OIDC
 *   trusted publishing when no registry token exists but `CARGO_ID_TOKEN`
 *   or GitHub Actions OIDC tokens are configured. Repositories without a
 *   root `Cargo.toml` leave the plugin inactive.
 * - `discover`: Discovers the crates of the Cargo workspace, filters them
 *   against the `filter` patterns, and loads crate metadata into context.
 * - `write`: Skips manifest updates when the plugin is inactive. Bumps
 *   crate versions and internal dependency requirements in
 *   `Cargo.toml` files (skipped in dry-run) and refreshes `Cargo.lock`
 *   with `cargo update --workspace` when a manifest changed.
 * - `publish`: Verifies the authenticated registry user may publish each
 *   planned crate, probes the sparse index for already published versions
 *   (skipping identical content and failing on different or unverifiable
 *   content), and publishes the remaining crates with `cargo publish`,
 *   recovering when an identical version was published concurrently.
 *   For trusted-publishing releases, exchanges the GitHub Actions OIDC
 *   identity token for a short-lived crates.io publish token and injects
 *   it into `cargo publish`, skipping the registry-user checks because
 *   trusted-publishing tokens carry no user. Skips entirely when
 *   configure-stage verification found no registry authentication.
 *
 * @param options Configuration options for Cargo workspace discovery and
 * publishing behavior.
 * @returns A release plugin configured for Cargo workspace management and
 * crate publication.
 */
const cargo = (options: PluginOptions = {}): ReleasePlugin => {
  let publishSkipped = false

  let registryAuth: RegistryAuth | undefined

  let active = false

  return {
    name: PLUGIN_NAME,
    version,
    configure: async (context, next) => {
      if (!(await hasCargoManifest(context.cwd))) {
        context.logger.debug(
          `Cargo workspace could not be found at "${context.cwd}".`
        )

        return next(context)
      }

      active = true

      const repo = await resolveGitRepositoryFromCargoManifest(
        context.cwd,
        context
      )

      context.repository = repo ?? context.repository

      const token = await resolveCargoToken(context)

      const trustedPublishing = !token && hasTrustedPublishingAuth(context.env)

      if (token) {
        const login = await verifyRegistryToken(context, token)

        registryAuth = { token, login }
      } else if (!trustedPublishing) {
        if (context.strict) {
          throw new Error(
            'The CARGO_REGISTRY_TOKEN environment variable is required in strict mode.'
          )
        }

        publishSkipped = true

        context.logger.warn(
          colors.yellow(
            'Crates will not be published: a crates.io registry token is required.'
          )
        )
      }

      if (!(await hasCargoCommand(context))) {
        if (context.strict) {
          throw new Error(
            'The cargo command is required for Cargo releases in strict mode.'
          )
        }

        publishSkipped = true

        context.logger.warn(
          colors.yellow(
            'Crates will not be published: the cargo command is not available.'
          )
        )
      }

      return next(context)
    },
    discover: async (context, next) => {
      if (!active) {
        return next(context)
      }

      const packages: Package[] = []

      for (const result of await loadCargoPackages(context.cwd)) {
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
      if (!active) {
        return next(context)
      }

      if (context.dryRun) {
        context.logger.debug('[DRY RUN] Cargo manifests will not be updated.')
      } else {
        const changed = await bumpCargoManifests(
          context.cwd,
          context.plans.filter((plan) => plan.package.provider === PLUGIN_NAME)
        )

        if (changed) {
          await refreshCargoLock(context)
        }
      }

      return next(context)
    },
    publish: async (context, next) => {
      if (!active) {
        context.logger.debug(
          'Cargo publishing was skipped: no Cargo workspace was found.'
        )

        return next(context)
      }

      if (publishSkipped) {
        context.logger.debug(
          'Cargo publishing was skipped during configuration.'
        )

        return next(context)
      }

      const auth = registryAuth

      const index = createSparseIndexClient({ signal: context.signal })

      const publishable = context.plans.filter(isCompleteReleasePlan)

      const skipped = new Set<ReleasePlan>()

      let publishToken: string | undefined

      if (publishable.length > 0) {
        if (context.dryRun) {
          context.logger.debug(
            '[DRY RUN] Crates will still be probed against the registry and packaged locally, but nothing will be uploaded.'
          )
        }

        if (auth) {
          await verifyPublishAccess(context, publishable, {
            token: auth.token,
            login: auth.login,
            index,
          })
        } else if (context.dryRun) {
          context.logger.debug(
            '[DRY RUN] The trusted-publishing token exchange will not be performed.'
          )
        } else {
          publishToken = await verifyTrustedPublishing(context)
        }

        for (const plan of publishable) {
          await probeCrateReleasePlan(context, plan, index, skipped)
        }
      }

      for (const plan of context.plans) {
        if (plan.package.provider !== PLUGIN_NAME || skipped.has(plan)) {
          continue
        }

        try {
          await publishCrate(context, plan, {
            dryRun: context.dryRun,
            allowDirty: options.allowDirty,
            noVerify: options.noVerify,
            registryToken: publishToken,
          })
        } catch (error) {
          if (!isCompleteReleasePlan(plan) || !isPublishOverRejection(error)) {
            throw error
          }

          await recoverFromCratePublishOverRejection(
            context,
            plan,
            index,
            error
          )
        }
      }

      return next(context)
    },
  }
}

export default cargo
