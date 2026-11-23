// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

const STAGE_REQUIRED_REJECTION_PATTERN = /E_STAGE_REQUIRED/i

/**
 * Determine whether an error reports that the registry requires staged
 * publishing.
 *
 * Matches the `E_STAGE_REQUIRED` error code the public npm registry answers
 * a direct publish with when the configured credentials may only stage
 * publications.
 *
 * @param error The error thrown by a publish command
 * @returns True when the error reports a staged-publishing requirement,
 * otherwise false
 */
export function isStageRequiredRejection(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)

  return STAGE_REQUIRED_REJECTION_PATTERN.test(message)
}
