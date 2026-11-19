// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { isPackageTagName, listGitTags } from '#git'
import type { GitCommit, ReleasePlan, ReleasePlugin } from '#types'
import {
  deriveChangeReleases,
  deriveTransitionReleases,
  propagateDependencyUpdates,
  readPackageHistory,
  resolvePackageTag,
} from '#workflow'
import { colors } from 'consola/utils'
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
 *   tag are analyzed from the beginning of history, and a warning is logged
 *   when the repository contains tags that follow the package's naming
 *   convention.
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
    let tags: string[] | null = null

    for (const plan of context.plans) {
      let history: Iterable<GitCommit> | AsyncIterable<GitCommit> = []

      if (plan.package.entry || plan.package.name) {
        const tag = await resolvePackageTag(context.cwd, plan.package)

        if (!tag) {
          tags ??= await listGitTags(context.cwd)

          if (
            tags.some((name) =>
              isPackageTagName(plan.package.entry, plan.package.name, name)
            )
          ) {
            context.logger.warn(
              colors.yellow(
                `Release tag could not be verified for package at "${colors.bold(plan.package.location)}"; analyzing commits since the beginning of history.`
              )
            )
          }
        }

        history = readPackageHistory(
          context.cwd,
          plan.package,
          tag ? { until: tag.name } : undefined
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
