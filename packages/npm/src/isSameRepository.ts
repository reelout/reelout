// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { GitRepository } from '@reelout/core'

/**
 * Check whether two Git repositories point to the same project.
 *
 * @param a First repository
 * @param b Second repository
 * @returns `true` when host, owner, and repository name are identical
 */
export function isSameRepository(a: GitRepository, b: GitRepository): boolean {
  return a.host === b.host && a.owner === b.owner && a.repo === b.repo
}
