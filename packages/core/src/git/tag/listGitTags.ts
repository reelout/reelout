// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { execGit } from '#util'

/**
 * List every Git tag in the repository.
 *
 * @param cwd Repository working directory
 * @returns Sorted tag names, or an empty array when none exist
 */
export async function listGitTags(cwd: string): Promise<string[]> {
  try {
    const stdout = await execGit(cwd, [
      'for-each-ref',
      '--format=%(refname:short)',
      'refs/tags/',
    ])

    return stdout.trim().split('\n').filter(Boolean)
  } catch {
    return []
  }
}
