// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { ReleaseContext, ReleasePlan } from '@reelout/core'
import { execCommand, isQuietEnvironment } from '@reelout/core'
import path from 'node:path'
import { inspectPackageManager } from '@reelout/npm/inspectPackageManager'
import type { PublishAccess } from '@reelout/npm/types'
import { prepareAuth } from './prepareAuth'

export interface PublishPackageOptions {
  dryRun?: boolean | undefined
  tag?: string | undefined
  access?: PublishAccess | null | undefined
  provenance?: boolean | undefined
  stage?: boolean | undefined
}

/**
 * Publish a package to a registry using the active Yarn release.
 *
 * Prepares registry authentication and constructs Yarn CLI flags to execute
 * the release publish operation. Skips execution if the package is private,
 * unversioned, or missing a package name. Fails when staged publishing is
 * requested while Yarn Classic is active, which has no staging support.
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

  const packageManager = await inspectPackageManager(context.cwd, {
    env: context.env,
  })

  const { isYarnClassic, isYarnBerry } = packageManager

  const commandArgs: string[] = []

  await using env = await prepareAuth(context, plan.package, packageManager)

  if (isYarnClassic) {
    if (options.stage) {
      throw new Error('Staged publishing is not supported by Yarn Classic.')
    }

    commandArgs.push('publish')
  } else if (isYarnBerry) {
    if (options.stage) commandArgs.push('npm', 'publish', '--staged')
    else commandArgs.push('npm', 'publish')
  }

  if (options.dryRun && isYarnClassic) return

  if (options.dryRun) commandArgs.push('--dry-run')

  if (options.tag) commandArgs.push('--tag', options.tag)

  if (options.access) commandArgs.push('--access', options.access)

  if (options.provenance && !isYarnClassic) commandArgs.push('--provenance')

  // Yarn's publish output is extremely verbose and its notice block goes to
  // stderr. A quiet environment keeps neither stream, so both are withheld
  // and `execCommand` surfaces the buffered output, stderr first, when the
  // publish fails.
  const quiet = isQuietEnvironment(context)

  if (quiet) {
    context.logger.debug(
      'Suppressing publish output because no terminal or CI log is attached.'
    )
  }

  await execCommand('yarn', commandArgs, {
    cwd: path.resolve(context.cwd, plan.package.location),
    env: { ...context.env, ...env },
    signal: context.signal,
    stdout: quiet ? undefined : context.stdout,
    stderr: quiet ? undefined : context.stderr,
  })
}
