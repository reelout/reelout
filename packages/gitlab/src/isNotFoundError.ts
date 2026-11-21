// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

/**
 * Check whether an error represents a GitLab API "not found" response.
 *
 * GitBeaker exposes the HTTP status of a failed request on the `cause`
 * property of the thrown error.
 *
 * @param err Error thrown by a GitBeaker API call
 * @returns True when the error represents a 404 response
 */
export function isNotFoundError(err: unknown): boolean {
  const status = (err as { cause?: { response?: { status?: number } } })?.cause
    ?.response?.status

  return status === 404
}
