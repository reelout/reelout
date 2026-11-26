// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { ExecCommandOptions } from '@reelout/core'
import semver from 'semver'
import { getPackageManagerFullVersion } from './getPackageManagerFullVersion'
import type { PackageManager } from './resolvePackageManager'

/**
 * Retrieve the major version number of an installed package manager.
 *
 * Derives the major version from the package manager's full semantic
 * version.
 *
 * @param cwd Working directory path where the binary command executes
 * @param manager Name of the package manager executable
 * @param options Additional execution, environment, and stream options
 * @returns Major version number or undefined if parsing fails
 */
export async function getPackageManagerVersion(
  cwd: string,
  manager: PackageManager,
  options?: Partial<ExecCommandOptions>
): Promise<number | undefined> {
  const version = await getPackageManagerFullVersion(cwd, manager, options)

  const parsed = version === undefined ? undefined : semver.parse(version)

  return parsed?.major
}
