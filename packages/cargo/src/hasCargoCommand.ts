// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { ReleaseContext } from '@reelout/core'
import { execCommand } from '@reelout/core'

/**
 * Determine whether the `cargo` command is available.
 *
 * Runs `cargo --version` so a missing or broken Cargo installation is
 * detected before any Cargo operation is attempted.
 *
 * @param context Release context containing environment and working directory
 * @returns True when the `cargo` command runs successfully
 */
export async function hasCargoCommand(
  context: Pick<ReleaseContext, 'cwd' | 'env' | 'signal'>
): Promise<boolean> {
  try {
    await execCommand('cargo', ['--version'], {
      cwd: context.cwd,
      env: { ...context.env },
      signal: context.signal,
    })

    return true
  } catch {
    return false
  }
}
