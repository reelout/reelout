// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { ReleaseContext, ReleasePlan } from '@reelout/core'
import { execCommand, isQuietEnvironment } from '@reelout/core'

/** Flags controlling a `cargo publish` invocation. */
export interface PublishCrateOptions {
  dryRun?: boolean | undefined
  allowDirty?: boolean | undefined
  noVerify?: boolean | undefined
  registryToken?: string | undefined
}

/**
 * Publish a crate to crates.io with `cargo publish`.
 *
 * Runs `cargo publish -p <name>` from the repository root, forwarding the
 * dry-run, allow-dirty, and no-verify flags when they are enabled. Dry
 * runs imply `--allow-dirty`: nothing is uploaded, so cargo's check for
 * uncommitted changes would only reject the working state the dry run
 * previews. Skips execution if the crate is private, unversioned, or
 * missing a name. The environment is passed through untouched, so `cargo`
 * reads `CARGO_REGISTRY_TOKEN` itself, unless a trusted-publishing
 * `registryToken` is provided and injected as `CARGO_REGISTRY_TOKEN`.
 *
 * @param context Release context containing environment, streams, and
 * working directory
 * @param plan Release plan describing the target crate and release version
 * @param options Publishing flags including dry-run status
 */
export async function publishCrate(
  context: ReleaseContext,
  plan: ReleasePlan,
  options: PublishCrateOptions = {}
): Promise<void> {
  if (plan.package.private || !plan.package.name || !plan.release?.version) {
    return
  }

  const commandArgs: string[] = ['publish', '-p', plan.package.name]

  if (options.dryRun) {
    commandArgs.push('--dry-run', '--allow-dirty')
  } else if (options.allowDirty) {
    commandArgs.push('--allow-dirty')
  }

  if (options.noVerify) {
    commandArgs.push('--no-verify')
  }

  const quiet = isQuietEnvironment(context)

  if (quiet) {
    context.logger.debug(
      'Suppressing publish output because no terminal or CI log is attached.'
    )
  }

  await execCommand('cargo', commandArgs, {
    cwd: context.cwd,
    env: options.registryToken
      ? { ...context.env, CARGO_REGISTRY_TOKEN: options.registryToken }
      : { ...context.env },
    signal: context.signal,
    stdout: quiet ? undefined : context.stdout,
    stderr: quiet ? undefined : context.stderr,
  })
}
