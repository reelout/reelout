// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type {
  GitCommit,
  ReleaseContext,
  ReleasePlan,
  ReleasePlugin,
} from '#types'
import { isMatch } from '#util'
import {
  collectUnreleased,
  deriveChangeReleases,
  deriveTransitionReleases,
  propagateDependencyUpdates,
  readReleaseFilterPatterns,
  sliceUnreleasedForPackage,
} from '#workflow'
import { colors } from 'consola/utils'
import { version } from '../package.json'

/**
 * Derive release plans by resolving history independently for every plan.
 *
 * Resolves each plan's commit history through `resolveHistory` so plans can
 * share a repository-wide window or keep their own release boundary, then
 * derives each release from its resolved history.
 *
 * @param context Release execution context containing runtime options
 * @param resolveHistory Resolves the commit history for a single plan
 * @returns Release plans updated with per-package histories and release types
 */
async function deriveSlicedReleases(
  context: ReleaseContext,
  resolveHistory: (
    plan: ReleasePlan
  ) => Iterable<GitCommit> | AsyncIterable<GitCommit>
): Promise<ReleasePlan[]> {
  const plans: ReleasePlan[] = []

  for (const plan of context.plans) {
    plans.push(
      ...(await deriveChangeReleases(
        context.type,
        context.classifier,
        [plan],
        resolveHistory(plan)
      ))
    )
  }

  return plans
}

/**
 * Built-in plugin that inspects repository history and produces release plans for packages.
 *
 * @remarks
 * **Lifecycle Stages:**
 * - `analyze`: Initializes release plans if empty, prunes packages and plans
 *   against the `filter` patterns when provided, extracts unreleased Git
 *   commit history, calculates package version bumps based on commit
 *   classifications, handles transition releases for empty changesets (if
 *   enabled), and propagates dependency updates across internal packages.
 *
 *   History slicing depends on the run scope: filtered runs slice history per
 *   package from its own latest release commit. Unfiltered runs read history
 *   up to the latest repository-wide release commit, share that window with
 *   the packages its release filter trailer released, and slice history
 *   independently for the packages it skipped.
 *
 * @returns A release plugin configured for package change analysis.
 */
const analyzer = (): ReleasePlugin => ({
  name: '@reelout/core/analyzer',
  version,
  analyze: async (context, next) => {
    if (context.plans.length === 0) {
      context.plans = context.packages.map((pkg): ReleasePlan => ({
        package: pkg,
        history: [],
        release: null,
      }))
    }

    const hasFilter = context.filter.length > 0

    if (hasFilter) {
      const available = context.packages

      context.packages = available.filter((pkg) =>
        isMatch(pkg.name ?? '', context.filter)
      )

      context.plans = context.plans.filter((plan) =>
        isMatch(plan.package.name ?? '', context.filter)
      )

      if (context.packages.length === 0) {
        let message = `Filter matched no packages: "${colors.bold(
          context.filter.join(', ')
        )}".`

        if (available.length > 0) {
          message += ` Available packages: ${available
            .map((pkg) => pkg.name ?? pkg.location)
            .join(', ')}.`
        }

        context.logger.warn(colors.yellow(message))
      }

      context.plans = await deriveSlicedReleases(context, (plan) =>
        sliceUnreleasedForPackage(context.cwd, plan.package)
      )
    } else {
      const window = await collectUnreleased(context.cwd)
      const patterns = readReleaseFilterPatterns(window.stop)

      context.plans =
        patterns === null
          ? await deriveChangeReleases(
              context.type,
              context.classifier,
              context.plans,
              window.history
            )
          : await deriveSlicedReleases(context, (plan) =>
              isMatch(plan.package.name ?? '', patterns)
                ? window.history
                : sliceUnreleasedForPackage(context.cwd, plan.package)
            )
    }

    if (context.allowEmpty) {
      context.plans = deriveTransitionReleases(
        context.type,
        context.versionQualifier,
        context.plans
      )
    }

    context.plans = await propagateDependencyUpdates(context.cwd, context.plans)

    return next(context)
  },
})

export default analyzer
