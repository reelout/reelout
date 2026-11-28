// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { ReleaseContext, ReleasePlan } from '@reelout/core'
import { execCommand, isQuietEnvironment } from '@reelout/core'
import path from 'node:path'
import { inspectPackageManager } from './inspectPackageManager'
import { prepareAuth } from './prepareAuth'
import type { PublishAccess } from './types'

export interface PublishPackageOptions {
  dryRun?: boolean | undefined
  tag?: string | undefined
  access?: PublishAccess | null | undefined
  provenance?: boolean | undefined
  stage?: boolean | undefined
}

/**
 * Publish a package to a registry using the active package manager.
 *
 * Prepares registry authentication and constructs package manager CLI flags to
 * execute the release publish operation. Skips execution if the package is
 * private, unversioned, or missing a package name. Fails when staged
 * publishing is requested while Yarn Classic is active, which has no staging
 * support.
 *
 * @param context Release context containing environment, streams, and directory
 * @param plan Release plan describing the target package and release version
 * @param options Publishing flags including dry-run status, tags, and provenance
 * @throws If staged publishing is requested while Yarn Classic is active
 */
export async function publishPackage(
  context: ReleaseContext,
  plan: ReleasePlan,
  options: PublishPackageOptions = {}
): Promise<void> {
  if (plan.package.private || !plan.package.name || !plan.release?.version) {
    return
  }

  const packageManager = await inspectPackageManager(
    context.cwd,
    {
      env: context.env,
    },
    context.logger
  )

  const { isNpm, isPnpm, isYarnClassic, isYarnBerry } = packageManager

  const commandArgs: string[] = []

  await using env = await prepareAuth(context, plan.package, packageManager)

  switch (true) {
    case isNpm:
    case isPnpm:
      if (options.stage) commandArgs.push('stage', 'publish')
      else commandArgs.push('publish')
      break
    case isYarnClassic:
      if (options.stage) {
        throw new Error('Staged publishing is not supported by Yarn Classic.')
      }

      commandArgs.push('publish')
      break
    case isYarnBerry:
      if (options.stage) commandArgs.push('npm', 'publish', '--staged')
      else commandArgs.push('npm', 'publish')
      break
  }

  if (options.dryRun && isYarnClassic) {
    context.logger.debug(
      '[DRY RUN] The publish was skipped: Yarn Classic does not support dry-run publishing.'
    )

    return
  }

  if (options.dryRun) commandArgs.push('--dry-run')

  if (options.tag) commandArgs.push('--tag', options.tag)

  if (options.access) commandArgs.push('--access', options.access)

  if (options.provenance && !isYarnClassic) commandArgs.push('--provenance')

  if (isPnpm) commandArgs.push('--no-git-checks')

  // Package manager output is extremely verbose and the package managers
  // disagree on where it goes: npm writes its whole notice block to stderr
  // while pnpm keeps everything on stdout. Quiet runs (CI, pipes, and other
  // non-interactive shells without --debug) keep neither stream: a
  // successful publish prints nothing, and a failed one surfaces its output
  // through the `execCommand` diagnostics, stderr first. Loud runs forward
  // the context streams, so the output streams live into the terminal or
  // the CI job log.
  const quiet = !context.debug && isQuietEnvironment(context)

  if (quiet) {
    context.logger.debug(
      'Suppressing publish output because no terminal is attached.'
    )
  }

  await execCommand(packageManager.name, commandArgs, {
    cwd: path.resolve(context.cwd, plan.package.location),
    env: { ...context.env, ...env },
    signal: context.signal,
    stdout: quiet ? undefined : context.stdout,
    stderr: quiet ? undefined : context.stderr,
  })
}
