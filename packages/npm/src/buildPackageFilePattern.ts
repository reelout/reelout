// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { ALL_FILES, type Workspace } from '@reelout/core'
import path from 'node:path'
import type { PackageManager } from './resolvePackageManager'

const LOCK_FILES = [
  'package-lock.json',
  'npm-shrinkwrap.json',
  'pnpm-lock.yaml',
  'yarn.lock',
]

const PNPM_WORKSPACE_FILE = 'pnpm-workspace.yaml'

export interface BuildPackageFilePatternOptions {
  root: boolean
  dir: string
  workspace: Workspace
  packageManager: PackageManager
}

/**
 * Build a glob pattern for package files.
 *
 * For workspace roots with members, returns an exclusion pattern that ignores
 * member directories and lock files. For packages or single-package workspaces,
 * returns an inclusion pattern for the package directory or all files. Workspace
 * members managed by pnpm additionally match the pnpm workspace manifest, so
 * catalog and member updates release every package resolving through it.
 *
 * @param options Pattern inputs including workspace metadata, directory, and
 * package manager
 * @returns Glob pattern string or list of glob patterns for the package files
 */
export function buildPackageFilePattern(
  options: BuildPackageFilePatternOptions
): string | string[] {
  const { root, dir, workspace, packageManager } = options

  const { members } = workspace

  if (members) {
    if (root) {
      const excluded = LOCK_FILES.concat(
        members.map((dir) => path.join(dir, ALL_FILES))
      ).join(',')

      return `!{${excluded}}`
    }

    const packageFiles = path.join(dir, ALL_FILES)

    if (packageManager === 'pnpm') {
      return [packageFiles, PNPM_WORKSPACE_FILE]
    }

    return packageFiles
  }

  return ALL_FILES
}
