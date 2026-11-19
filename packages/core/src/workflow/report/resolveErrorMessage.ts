// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

/**
 * Resolve a displayable message from an unknown error value.
 *
 * Normalizes `Error` instances to their `message` and passes string values
 * through unchanged. Returns `null` for any other shape so callers can fall
 * back to a generic message.
 *
 * @param error Unknown error value carried on a release outcome
 * @returns The resolved error message, or `null` when none can be resolved
 */
export function resolveErrorMessage(error: unknown): string | null {
  if (Error.isError(error)) return error.message

  return typeof error === 'string' ? error : null
}
