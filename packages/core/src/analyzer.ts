// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { ReleaseContext, ReleasePlan, ReleasePlugin } from '#types'
import { isMatch } from '#util'
import {
  collectUnreleased,
  deriveChangeReleases,
  deriveTransitionReleases,
  propagateDependencyUpdates,
  readReleaseFilterPatterns,
  sliceUnreleasedForPackage,
  type UnreleasedWindow,
} from '#workflow'
import { colors } from 'consola/utils'
import { version } from '../package.json'

/**
 * Derive release plans when the latest release commit was a filtered release.
 *
 * Packages the release filter trailer released share the unreleased window it
 * bounds, while packages it skipped slice history back to their own release
 * boundary.
 *
 * @param context Release execution context containing runtime options
 * @param window Unreleased window bounded by the filtered release commit
 * @param patterns Filter patterns carried by the release filter trailer
 * @returns Release plans updated with per-package histories and release types
 */
async function deriveFilteredWindowReleases(
  context: ReleaseContext,
  window: UnreleasedWindow,
  patterns: string[]
): Promise<ReleasePlan[]> {
  const plans: ReleasePlan[] = []

  for (const plan of context.plans) {
    plans.push(
      ...(await deriveChangeReleases(
        context.type,
        context.classifier,
        [plan],
        isMatch(plan.package.name ?? '', patterns)
          ? window.history
          : sliceUnreleasedForPackage(context.cwd, plan.package)
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
 * - `analyze`: Initializes release plans if empty, prunes plans against the
 *   `filter` patterns when provided, extracts unreleased Git
 *   commit history, calculates package version bumps based on commit
 *   classifications, handles transition releases for empty changesets (if
 *   enabled), and propagates dependency updates across internal packages.
 *
 *   History slicing starts at the latest repository-wide release commit: when
 *   it carries no release filter trailer it bounds every package and all
 *   plans share its unreleased window; when it carries one, the packages its
 *   filter released share the window while the packages it skipped slice
 *   history back to their own release boundary.
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

    if (context.filter.length > 0) {
      const available = context.plans

      context.plans = available.filter((plan) =>
        isMatch(plan.package.name ?? '', context.filter)
      )

      if (context.plans.length === 0) {
        let message = `Filter matched no packages: "${colors.bold(
          context.filter.join(', ')
        )}".`

        if (available.length > 0) {
          message += ` Available packages: ${available
            .map((plan) => plan.package.name ?? plan.package.location)
            .join(', ')}.`
        }

        context.logger.warn(colors.yellow(message))
      }
    }

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
        : await deriveFilteredWindowReleases(context, window, patterns)

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
