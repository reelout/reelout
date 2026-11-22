// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { ALL_FILES, isSemVer, type Package } from '@reelout/core'
import { glob } from 'glob'
import path from 'node:path'
import {
  CARGO_DEPENDENCY_TABLES,
  CARGO_LOCK_FILE,
  CARGO_MANIFEST_FILE,
  hasCargoManifest,
  readCargoToml,
  type CargoToml,
} from './readCargoToml'

/** Inputs for building metadata for one crate of a Cargo workspace. */
interface BuildCargoPackageOptions {
  rootDir: string
  packageDir: string
  manifest: CargoToml
  inheritedVersion: string | undefined
  files: string | string[]
}

/**
 * Load the crates of the Cargo workspace rooted at a directory.
 *
 * Reads the root `Cargo.toml` and discovers its crates: the workspace
 * members listed under `[workspace] members` (globs expanded, `exclude`
 * respected) plus the root crate itself when the root manifest defines a
 * `[package]` table. Repositories without a root manifest yield no crates,
 * and a root manifest without `[workspace] members` is treated as a single
 * crate when it defines a `[package]` table. Each crate is returned as a
 * settled result, so one unreadable manifest does not hide the others.
 *
 * @param cwd Repository working directory holding the root Cargo manifest
 * @returns Promise resolving to a settled load result per discovered crate,
 * root crate first, then members in directory order
 */
export async function loadCargoPackages(
  cwd: string
): Promise<PromiseSettledResult<Package>[]> {
  if (!(await hasCargoManifest(cwd))) {
    return []
  }

  let rootManifest: CargoToml

  try {
    rootManifest = await readCargoToml(cwd)
  } catch (err) {
    return [
      {
        status: 'rejected',
        reason: err,
      },
    ]
  }

  const rootPackage = rootManifest.package

  const members = rootManifest.workspace?.members

  const memberDirs =
    Array.isArray(members) && members.length > 0
      ? await resolveMemberDirs(cwd, members, rootManifest.workspace?.exclude)
      : []

  const inheritedVersion = rootManifest.workspace?.package?.version

  const results: PromiseSettledResult<Package>[] = []

  if (rootPackage) {
    results.push(
      await settle(() =>
        buildCargoPackage({
          rootDir: cwd,
          packageDir: '.',
          manifest: rootManifest,
          inheritedVersion,
          files:
            memberDirs.length > 0
              ? buildWorkspaceRootFilePattern(memberDirs)
              : ALL_FILES,
        })
      )
    )
  }

  for (const memberDir of memberDirs) {
    results.push(
      await settle(async () =>
        buildCargoPackage({
          rootDir: cwd,
          packageDir: memberDir,
          manifest: await readCargoToml(path.resolve(cwd, memberDir)),
          inheritedVersion,
          files: buildMemberFilePattern(memberDir),
        })
      )
    )
  }

  return results
}

/**
 * Run a build and wrap its outcome in a settled result.
 *
 * @param build Deferred crate build
 * @returns A fulfilled result on success, or a rejected result carrying the
 * build error
 */
async function settle(
  build: () => Promise<Package>
): Promise<PromiseSettledResult<Package>> {
  try {
    return {
      status: 'fulfilled',
      value: await build(),
    }
  } catch (err) {
    return {
      status: 'rejected',
      reason: err,
    }
  }
}

/**
 * Expand workspace member globs into the directories holding crates.
 *
 * @param cwd Repository working directory
 * @param members Member glob patterns from `[workspace] members`
 * @param exclude Exclude patterns from `[workspace] exclude`
 * @returns Sorted member directories, relative to the repository root
 */
async function resolveMemberDirs(
  cwd: string,
  members: readonly string[],
  exclude: readonly string[] | undefined
): Promise<string[]> {
  const manifestFiles = await glob(
    members.map((pattern) => path.posix.join(pattern, CARGO_MANIFEST_FILE)),
    exclude !== undefined && exclude.length > 0
      ? {
          cwd,
          ignore: exclude.map((pattern) => path.posix.join(pattern, '**')),
        }
      : { cwd }
  )

  return manifestFiles
    .map((filePath) => path.posix.dirname(filePath))
    .sort((a, b) => a.localeCompare(b))
}

/**
 * Build the file pattern for a workspace member crate.
 *
 * Attributes the member directory plus the shared root manifest and
 * lockfile to the member, so manifest, workspace inheritance, and lockfile
 * changes release every crate they can affect.
 *
 * @param memberDir Member directory relative to the repository root
 * @returns Glob patterns for the files owned by the member crate
 */
function buildMemberFilePattern(memberDir: string): string[] {
  return [
    path.posix.join(memberDir, ALL_FILES),
    CARGO_MANIFEST_FILE,
    CARGO_LOCK_FILE,
  ]
}

/**
 * Build the file pattern for a crate defined by the workspace root
 * manifest.
 *
 * Excludes the member directories and the lockfile, which belong to the
 * member crates, so only the root crate's own files remain.
 *
 * @param memberDirs Member directories relative to the repository root
 * @returns Negated glob pattern matching everything but the members
 */
function buildWorkspaceRootFilePattern(memberDirs: readonly string[]): string {
  const excluded = [
    CARGO_LOCK_FILE,
    ...memberDirs.map((dir) => path.posix.join(dir, ALL_FILES)),
  ].join(',')

  return `!{${excluded}}`
}

/**
 * Build metadata for one crate of a Cargo workspace.
 *
 * Resolves the crate name, version (literal or inherited through
 * `version.workspace = true`), publish restriction, dependency names, and
 * the crate's location and file ownership pattern.
 *
 * @param options Crate build inputs
 * @returns Crate metadata object
 * @throws If the manifest defines no `[package]` table, or the crate has no
 * version or a version that is not valid semver
 */
async function buildCargoPackage(
  options: BuildCargoPackageOptions
): Promise<Package> {
  const { rootDir, manifest, inheritedVersion, files } = options

  const resolvedPackageDir = path.resolve(rootDir, options.packageDir)

  const packageDir = path.normalize(path.relative(rootDir, resolvedPackageDir))

  const pkg = manifest.package

  if (!pkg) {
    throw new Error(
      `Cargo manifest in "${packageDir}" does not define a [package] table.`
    )
  }

  const { version } = pkg

  const resolvedVersion =
    typeof version === 'string'
      ? version
      : version?.workspace === true
        ? inheritedVersion
        : undefined

  if (!isSemVer(resolvedVersion)) {
    throw new Error(
      `Package version "${resolvedVersion}" in "${packageDir}" is not a valid semantic version.`
    )
  }

  return {
    name: typeof pkg.name === 'string' ? pkg.name : undefined,
    version: resolvedVersion,
    private: pkg.publish === false || Array.isArray(pkg.publish),
    root: packageDir === '.',
    entry: packageDir === '.',
    dependencies: collectCargoDependencyNames(manifest),
    location: packageDir,
    files,
  }
}

/**
 * Collect the dependency names a crate manifest declares.
 *
 * Reads the `dependencies`, `dev-dependencies`, and `build-dependencies`
 * tables, including their target-scoped variants under `[target.*]`, and
 * returns the declared names sorted and deduplicated. Workspace-inherited
 * references (`name.workspace = true`) declare the same names, so their
 * keys are included as well.
 *
 * @param manifest The parsed crate manifest
 * @returns Sorted dependency names declared by the manifest
 */
export function collectCargoDependencyNames(manifest: CargoToml): string[] {
  const names = new Set<string>()

  for (const table of CARGO_DEPENDENCY_TABLES) {
    collectTableKeys(manifest[table], names)
  }

  if (manifest.target && typeof manifest.target === 'object') {
    for (const target of Object.values(manifest.target)) {
      if (!target || typeof target !== 'object') {
        continue
      }

      for (const table of CARGO_DEPENDENCY_TABLES) {
        collectTableKeys(target[table], names)
      }
    }
  }

  return [...names].sort()
}

/**
 * Add the keys of a dependency table to a name set.
 *
 * @param table The dependency table read from a parsed manifest
 * @param names The set collecting dependency names
 */
function collectTableKeys(
  table: Record<string, unknown> | undefined,
  names: Set<string>
): void {
  if (!table || typeof table !== 'object') {
    return
  }

  for (const key of Object.keys(table)) {
    names.add(key)
  }
}
