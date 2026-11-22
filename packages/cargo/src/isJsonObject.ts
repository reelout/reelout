// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

/**
 * Determine whether a value is a plain JSON object.
 *
 * @param value The value to inspect
 * @returns True when the value is a non-array, non-null object
 */
export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
