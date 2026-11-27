// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { GitCommit, ReleasePlan, ReleasePlugin } from '#types'
import {
  deriveChangeReleases,
  deriveTransitionReleases,
  propagateDependencyUpdates,
  readPackageHistory,
  resolvePackageTag,
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
 *   History slicing starts at each package's own verified release tag: the
 *   tag matching the package's current version is resolved and verified, and
 *   only commits after it are analyzed. Packages that can never be tagged
 *   (workspace packages without a name) are ignored: they keep their release
 *   plan but receive no history-based release. Packages without a verified
 *   tag are analyzed from the beginning of history.
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

    const plans: ReleasePlan[] = []

    for (const plan of context.plans) {
      let history: Iterable<GitCommit> | AsyncIterable<GitCommit> = []

      if (plan.package.entry || plan.package.name) {
        const tag =
          plan.package.tag ??
          (await resolvePackageTag(context.cwd, plan.package, {
            logger: context.logger,
            dryRun: context.dryRun,
          }))

        if (tag && !plan.package.tag) {
          plan.package.tag = tag
        }

        history = readPackageHistory(
          context.cwd,
          plan.package,
          tag
            ? { until: tag.name, logger: context.logger }
            : { logger: context.logger }
        )
      }

      plans.push(
        ...(await deriveChangeReleases(
          context.type,
          context.classifier,
          [plan],
          history
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
