// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { ReleaseOutcome } from '#types'

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

const FALLBACK_ERROR_MESSAGE =
  'An unexpected error occurred during the release process.'

/**
 * Resolve a displayable failure message from a release outcome.
 *
 * Normalizes the outcome error to its message and falls back to a generic
 * message when the error carries no displayable content.
 *
 * @param outcome Failure outcome whose error is rendered
 * @returns The resolved error message, or the fallback message
 */
export function resolveOutcomeErrorMessage(outcome: ReleaseOutcome): string {
  return resolveErrorMessage(outcome.error) || FALLBACK_ERROR_MESSAGE
}
