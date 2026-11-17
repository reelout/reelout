// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

/**
 * Normalize glob patterns for matching.
 *
 * Wraps a single pattern in a list and expands negation-only inputs with
 * `**`, which also matches the empty string, so targets without names are
 * included alongside every non-excluded match.
 *
 * @param patterns Single pattern or list of patterns to normalize
 * @returns Normalized list of patterns
 */
export function normalizeFilter(
  patterns: string | readonly string[] | undefined
): string[] {
  const list = typeof patterns === 'string' ? [patterns] : [...(patterns ?? [])]

  if (list.length === 0) {
    return []
  }

  return list.some((pattern) => !pattern.startsWith('!'))
    ? list
    : ['**', ...list]
}
