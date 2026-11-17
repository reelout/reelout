// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { Package } from '#types'
import { isMatch } from '#util'

/**
 * Filter packages by name patterns.
 *
 * Keeps the packages whose names match `patterns`, scoping a release run to
 * a subset of the discovered workspace. Returns a copy of every package when
 * `patterns` is empty.
 *
 * @param packages The workspace packages to filter.
 * @param patterns The minimatch patterns to match package names against.
 * @returns The packages whose names match the patterns.
 */
export function filterPackages(
  packages: readonly Package[],
  patterns: readonly string[]
): Package[] {
  if (patterns.length === 0) {
    return [...packages]
  }

  return packages.filter((pkg) => isMatch(pkg.name ?? '', patterns))
}
