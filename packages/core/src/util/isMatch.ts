// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { minimatch } from 'minimatch'

/**
 * Determine whether a target string matches glob patterns.
 *
 * Matches positive and negative glob patterns using dotfile support.
 * Negation-only patterns are expanded with a catch-all pattern so they match
 * every named target the patterns do not exclude.
 *
 * @param target Target string to evaluate against glob patterns
 * @param patterns Single glob pattern or list of patterns to evaluate
 * @returns True if target matches positive patterns and satisfies negative patterns
 */
export function isMatch(
  target: string,
  patterns: string | readonly string[]
): boolean {
  if (typeof patterns === 'string') {
    patterns = [patterns]
  }

  if (
    patterns.length > 0 &&
    patterns.every((pattern) => pattern.startsWith('!'))
  ) {
    patterns = ['**/*', ...patterns]
  }

  const positives: string[] = []
  const negatives: string[] = []

  for (const pattern of patterns) {
    if (pattern.startsWith('!')) {
      negatives.push(pattern)
    } else {
      positives.push(pattern)
    }
  }

  return (
    positives.some((pattern) => minimatch(target, pattern, { dot: true })) &&
    negatives.every((pattern) => minimatch(target, pattern, { dot: true }))
  )
}
