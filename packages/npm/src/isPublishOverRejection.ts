// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

const PUBLISH_OVER_REJECTION_PATTERN =
  /EPUBLISHCONFLICT|publish over|previously published/i

/**
 * Determine whether an error rejects publishing over an existing version.
 *
 * Matches the conflict markers used across npm-compatible registries and
 * package managers: npm's `EPUBLISHCONFLICT` error code and the "cannot
 * publish over the previously published versions" wording shared by npm,
 * pnpm, and Yarn.
 *
 * @param error The error thrown by a publish command
 * @returns True when the error reports a publish-over conflict, otherwise false
 */
export function isPublishOverRejection(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)

  return PUBLISH_OVER_REJECTION_PATTERN.test(message)
}
