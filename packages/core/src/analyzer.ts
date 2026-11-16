// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { ReleaseContext, ReleasePlan, ReleasePlugin } from '#types'
import { isMatch } from '#util'
import {
  collectUnreleased,
  deriveChangeReleases,
  deriveTransitionReleases,
  isFilteredReleaseCommit,
  propagateDependencyUpdates,
  sliceUnreleasedForPackage,
} from '#workflow'
import { colors } from 'consola/utils'
import { version } from '../package.json'

/**
 * Derive release plans using per-package unreleased history.
 *
 * Slices history independently for every plan so each package releases from
 * its own most recent release commit instead of the repository-wide one.
 *
 * @param context Release execution context containing runtime options
 * @returns Release plans updated with per-package histories and release types
 */
async function derivePerPackageReleases(
  context: ReleaseContext
): Promise<ReleasePlan[]> {
  const plans: ReleasePlan[] = []

  for (const plan of context.plans) {
    plans.push(
      ...(await deriveChangeReleases(
        context.type,
        context.classifier,
        [plan],
        sliceUnreleasedForPackage(context.cwd, plan.package)
      ))
    )
  }

  return plans
}

/**
 * Check whether a package name matches the given filter patterns.
 *
 * Negation-only filters imply inclusion for every package the patterns do
 * not exclude, mirroring the single-pattern expansion of `isMatch`.
 *
 * @param name Package name to test, possibly undefined for entry packages
 * @param filter Filter patterns to match against
 * @returns True when the name matches at least one pattern
 */
function matchesFilter(name: string | undefined, filter: string[]): boolean {
  return isMatch(
    name ?? '',
    filter.some((pattern) => !pattern.startsWith('!'))
      ? filter
      : ['**/*', ...filter]
  )
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
 *   History slicing depends on the run scope: unfiltered runs read history up
 *   to the latest repository-wide release commit and escalate to per-package
 *   slicing when that commit was created by a filtered run, while filtered
 *   runs always slice history per package from its own latest release commit.
 *
 * @returns A release plugin configured for package change analysis.
 */
const analyzer = (): ReleasePlugin => ({
  name: '@reelout/core/analyzer',
  version,
  analyze: async (context, next) => {
    const hasFilter = context.filter.length > 0

    if (hasFilter) {
      const available = context.packages

      context.packages = available.filter((pkg) =>
        matchesFilter(pkg.name, context.filter)
      )

      context.plans = context.plans.filter((plan) =>
        matchesFilter(plan.package.name, context.filter)
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
    }

    if (context.plans.length === 0) {
      context.plans = context.packages.map((pkg): ReleasePlan => ({
        package: pkg,
        history: [],
        release: null,
      }))
    }

    if (hasFilter) {
      context.plans = await derivePerPackageReleases(context)
    } else {
      const window = await collectUnreleased(context.cwd)

      if (await isFilteredReleaseCommit(context.cwd, window.stop)) {
        context.plans = await derivePerPackageReleases(context)
      } else {
        context.plans = await deriveChangeReleases(
          context.type,
          context.classifier,
          context.plans,
          window.history
        )
      }
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
