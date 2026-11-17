// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { ReleasePlan, ReleasePlugin } from '#types'
import { isMatch } from '#util'
import {
  collectUnreleased,
  deriveChangeReleases,
  deriveTransitionReleases,
  propagateDependencyUpdates,
  readReleaseFilterPatterns,
  sliceUnreleasedForPackage,
} from '#workflow'
import { version } from '../package.json'

/**
 * Built-in plugin that inspects repository history and produces release plans for packages.
 *
 * @remarks
 * **Lifecycle Stages:**
 * - `analyze`: Initializes release plans if empty, extracts unreleased Git
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

    const window = await collectUnreleased(context.cwd)
    const patterns = readReleaseFilterPatterns(window.stop)
    const plans: ReleasePlan[] = []

    for (const plan of context.plans) {
      const released =
        patterns === null || isMatch(plan.package.name ?? '', patterns)

      plans.push(
        ...(await deriveChangeReleases(
          context.type,
          context.classifier,
          [plan],
          released
            ? window.history
            : sliceUnreleasedForPackage(context.cwd, plan.package)
        ))
      )
    }

    context.plans = plans

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
