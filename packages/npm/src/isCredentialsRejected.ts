// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { formatError } from '@reelout/core'

/**
 * Match registry errors that report rejected credentials.
 */
const AUTH_REJECTED_PATTERN =
  /E401|ENEEDAUTH|401 Unauthorized|Response Code: 401|Unable to authenticate|not logged in/i

/**
 * Determine whether an error reports that the registry rejected the
 * configured credentials.
 *
 * Matches the error codes and phrases registries and package managers emit
 * for missing or invalid credentials, so credential rejections can be told
 * apart from unreachable registries and unrelated command failures.
 *
 * @param error The error from a failed registry command
 * @returns True when the error reports rejected credentials
 */
export function isCredentialsRejected(error: unknown): boolean {
  return AUTH_REJECTED_PATTERN.test(String(formatError(error)))
}
