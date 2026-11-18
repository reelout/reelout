// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { readParsedGitHistory, type ReadGitHistoryOptions } from '#git'
import type { GitCommit, Package } from '#types'
import { packageContainsCommit } from './packageContainsCommit'

const GLOB_MAGIC = /[*?[\]{}!+@]/

/**
 * Yield commits from git history associated with a package.
 *
 * Filters git commit history to yield only entries relevant to the target
 * `pkg` directory. When the package file pattern is a list, plain file
 * entries are added to the git path filter alongside the package directory,
 * so commits touching extra package files (for example the pnpm workspace
 * manifest) are included.
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
  options = {
    ...options,
    filePath:
      options.filePath ||
      (Array.isArray(pkg.files)
        ? [pkg.location, ...pkg.files.filter((file) => !GLOB_MAGIC.test(file))]
        : pkg.location),
  }

  for await (const commit of readParsedGitHistory(cwd, options)) {
    if (packageContainsCommit(pkg, commit)) {
      yield commit
    }
  }
}
