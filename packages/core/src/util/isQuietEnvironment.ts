// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { ReleaseContext } from '../types'
import { isCI } from './isCI'

/**
 * Determine whether the current run should stay quiet about verbose output.
 *
 * A run is quiet when its verbose output would only accumulate noise: no
 * terminal is attached for a human to read it live, or the run is inside CI
 * where the provider records a job log that publish noise would pollute.
 * Quiet runs still surface command output through `execCommand`'s failure
 * diagnostics, so failures stay diagnosable.
 *
 * CI runs stay quiet even when the provider attaches a pseudo-terminal: the
 * `isCI` check guarantees it on top of the TTY check, so the job log keeps
 * the publish results without the package manager noise.
 *
 * The verdict is per environment, not per stream, so a redirected stdout inside
 * an interactive terminal still counts as quiet.
 *
 * @param context Release context carrying the destination stream and environment
 * @returns `true` when the run is part of CI or no TTY is attached
 */
export function isQuietEnvironment(
  context: Pick<ReleaseContext, 'env' | 'stdout'>
): boolean {
  if (isCI(context.env)) return true

  const stream = context.stdout as NodeJS.WriteStream | undefined

  return stream?.isTTY !== true
}
