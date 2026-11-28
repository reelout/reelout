// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { ReleaseContext } from '@reelout/core'
import { execCommand, isQuietEnvironment } from '@reelout/core'
import { colors } from 'consola/utils'
import fs from 'node:fs/promises'
import path from 'node:path'
import { hasCargoCommand } from './hasCargoCommand'
import { CARGO_LOCK_FILE } from './readCargoToml'

/**
 * Refresh the Cargo lockfile after crate manifests changed.
 *
 * Runs `cargo update --workspace` in the repository root, re-locking every
 * workspace dependency to the latest version compatible with the manifest
 * requirements ReelOut just wrote, so the refreshed lockfile lands in the
 * release commit. Workspaces without a lockfile are skipped, and a missing
 * `cargo` command downgrades the refresh to a warning instead of failing
 * the release.
 *
 * @param context Release context containing environment, streams, and
 * working directory
 * @returns A promise that resolves when the lockfile is refreshed
 * @throws If `cargo update --workspace` fails
 */
export async function refreshCargoLock(context: ReleaseContext): Promise<void> {
  try {
    await fs.access(path.join(context.cwd, CARGO_LOCK_FILE))
  } catch {
    return
  }

  if (!(await hasCargoCommand(context))) {
    context.logger.warn(
      colors.yellow(
        'Cargo.lock will not be refreshed: the cargo command is not available.'
      )
    )

    return
  }

  const quiet = !context.debug && isQuietEnvironment(context)

  try {
    await execCommand('cargo', ['update', '--workspace'], {
      cwd: context.cwd,
      env: { ...context.env },
      signal: context.signal,
      stdout: quiet ? undefined : context.stdout,
      stderr: quiet ? undefined : context.stderr,
    })
  } catch (cause) {
    throw new Error(
      "Cargo.lock could not be refreshed: 'cargo update --workspace' failed.",
      { cause }
    )
  }
}
