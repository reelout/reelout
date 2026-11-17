// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { minimatch } from 'minimatch'
import { normalizeFilter } from './normalizeFilter'

/**
 * Determine whether a target string matches glob patterns.
 *
 * Matches positive and negative glob patterns using dotfile support.
 * Negation-only patterns are expanded with a global wildcard so they match
 * every target the patterns do not exclude, including empty targets such
 * as nameless packages.
 *
 * @param target Target string to evaluate against glob patterns
 * @param patterns Single glob pattern or list of patterns to evaluate
 * @returns True if target matches positive patterns and satisfies negative patterns
 */
export function isMatch(
  target: string,
  patterns: string | readonly string[]
): boolean {
  const positives: string[] = []
  const negatives: string[] = []

  for (const pattern of normalizeFilter(patterns)) {
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
