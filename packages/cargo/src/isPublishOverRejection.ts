// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

const PUBLISH_OVER_REJECTION_PATTERN = /already exists/i

/**
 * Determine whether an error rejects publishing over an existing crate
 * version.
 *
 * Matches the "crate version `<version>` already exists" wording crates.io
 * responds with when a publish targets a version the registry already
 * holds.
 *
 * @param error The error thrown by a publish command
 * @returns True when the error reports a publish-over conflict, otherwise
 * false
 */
export function isPublishOverRejection(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)

  return PUBLISH_OVER_REJECTION_PATTERN.test(message)
}
