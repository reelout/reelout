// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

/**
 * Format filter patterns as a release filter trailer value.
 *
 * Escapes the commas within patterns and joins them with commas, so
 * `readReleaseFilterPatterns` can split the trailer value back into the
 * original patterns.
 *
 * @param patterns Filter patterns to format into a trailer value
 * @returns The comma-joined, escaped trailer value
 */
export function formatReleaseFilterPatterns(
  patterns: readonly string[]
): string {
  return patterns.map((pattern) => pattern.replaceAll(',', '\\,')).join(', ')
}
