// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { readParsedGitHistory, type ReadGitHistoryOptions } from '#git'
import type { GitCommit, Package } from '#types'
import { unique } from '#util'
import { packageContainsCommit } from './packageContainsCommit'

const LITERAL_PATH = /^[^*?[\]{}!+@]*$/

/**
 * Yield commits from git history associated with a package.
 *
 * Filters git commit history to yield only entries relevant to the target
 * `pkg` directory. When the package file pattern is a list, plain file
 * entries are added to the git path filter alongside the package directory
 * (duplicates removed), so commits touching extra package files (for example
 * the pnpm workspace manifest) are included. Only entries without glob or
 * pattern metacharacters (wildcards, braces, and the extglob or negation
 * characters used by package file patterns) are passed to git, because git
 * pathspecs would interpret those characters differently. Pattern-like
 * entries are left to `packageContainsCommit`, which matches them with the
 * package's own file-pattern semantics.
 *
 * @param cwd Path to the working directory for git commands
 * @param pkg Package configuration containing the target directory
 * @param options Options for parsing and filtering git history
 * @yields Commits belonging to the specified package
 */
export async function* readPackageHistory(
  cwd: string,
  pkg: Package,
  options: ReadGitHistoryOptions = {}
): AsyncGenerator<GitCommit> {
  options = { ...options }

  if (!options.filePath) {
    if (Array.isArray(pkg.files)) {
      options.filePath = unique([
        pkg.location,
        ...pkg.files.filter((file) => LITERAL_PATH.test(file)),
      ])
    } else {
      options.filePath = pkg.location
    }
  }

  for await (const commit of readParsedGitHistory(cwd, options)) {
    if (packageContainsCommit(pkg, commit)) {
      yield commit
    }
  }
}
