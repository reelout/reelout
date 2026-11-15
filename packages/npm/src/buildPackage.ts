// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { isSemVer, type Package, type Workspace } from '@reelout/core'
import path from 'node:path'
import { buildPackageFilePattern } from './buildPackageFilePattern'
import { readPackageJson } from './readPackageJson'
import type { PackageManager } from './resolvePackageManager'

export interface BuildPackageOptions {
  rootDir: string
  packageManager: PackageManager
  packageDir: string
  workspace: Workspace
}

/**
 * Build metadata for a package within a workspace.
 *
 * Reads the package manifest and computes canonical fields used by the release
 * process, including normalized paths and file patterns.
 *
 * @param options Package build inputs including directories, workspace
 * metadata, and package manager
 * @returns Package metadata object
 * @throws If the package version is not a valid semantic version
 */
export async function buildPackage(
  options: BuildPackageOptions
): Promise<Package> {
  const { rootDir, packageManager, workspace } = options

  const resolvedPackageDir = path.resolve(rootDir, options.packageDir)

  const manifest = await readPackageJson(resolvedPackageDir)

  const packageDir = path.normalize(path.relative(rootDir, resolvedPackageDir))

  const root = packageDir === '.'

  const entry = packageDir === workspace.entry

  const { version } = manifest

  if (!isSemVer(version)) {
    throw new Error(
      `Package version "${version}" in "${packageDir}" is not a valid semantic version.`
    )
  }

  return {
    name: manifest.name,
    version,
    private: manifest.private,
    root,
    entry,
    dependencies: Object.keys({
      ...manifest.dependencies,
      ...manifest.devDependencies,
      ...manifest.optionalDependencies,
    }).sort(),
    location: packageDir,
    files: buildPackageFilePattern({
      workspace,
      root,
      dir: packageDir,
      packageManager,
    }),
  }
}
