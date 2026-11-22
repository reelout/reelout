// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { colors } from 'consola/utils'
import fs from 'node:fs/promises'
import path from 'node:path'
import { parse } from 'smol-toml'

/** The file name of a Cargo manifest. */
export const CARGO_MANIFEST_FILE = 'Cargo.toml'

/** The file name of the Cargo lockfile. */
export const CARGO_LOCK_FILE = 'Cargo.lock'

/**
 * The top-level Cargo tables that define dependencies. Workspace-level
 * dependency tables (`[workspace.dependencies]`) are handled separately
 * because only the workspace root manifest carries them.
 */
export const CARGO_DEPENDENCY_TABLES = [
  'dependencies',
  'dev-dependencies',
  'build-dependencies',
] as const

/**
 * A `[package]` value inherited from the workspace manifest through a
 * dotted key such as `version.workspace = true`.
 */
export interface CargoInheritedValue {
  workspace?: boolean | undefined
}

/** The parsed `[package]` table of a Cargo manifest. */
export interface CargoPackageTable {
  name?: string | undefined
  version?: string | CargoInheritedValue | undefined
  repository?: string | undefined
  publish?: boolean | readonly string[] | undefined
}

/** The parsed `[workspace]` table of a Cargo manifest. */
export interface CargoWorkspaceTable {
  members?: readonly string[] | undefined
  exclude?: readonly string[] | undefined
  package?: { version?: string | undefined } | undefined
}

/** The dependency tables scoped to a build target, under `[target.*]`. */
export interface CargoTargetTables {
  dependencies?: Record<string, unknown> | undefined
  'dev-dependencies'?: Record<string, unknown> | undefined
  'build-dependencies'?: Record<string, unknown> | undefined
}

/**
 * The subset of a parsed Cargo manifest ReelOut reads.
 */
export interface CargoToml {
  package?: CargoPackageTable | undefined
  workspace?: CargoWorkspaceTable | undefined
  dependencies?: Record<string, unknown> | undefined
  'dev-dependencies'?: Record<string, unknown> | undefined
  'build-dependencies'?: Record<string, unknown> | undefined
  target?: Record<string, CargoTargetTables> | undefined
}

/**
 * Read and parse the Cargo manifest in a directory.
 *
 * Reads `Cargo.toml` in the directory and parses it into the manifest
 * subset ReelOut reads, wrapping read and parse failures in errors that
 * name the offending file.
 *
 * @param dir Directory containing the Cargo manifest
 * @returns The parsed Cargo manifest
 * @throws If the manifest cannot be read or is not valid TOML
 */
export async function readCargoToml(dir: string): Promise<CargoToml> {
  const filePath = path.join(dir, CARGO_MANIFEST_FILE)

  let text: string

  try {
    text = await fs.readFile(filePath, 'utf-8')
  } catch (err) {
    throw new Error(
      `TOML file at "${colors.bold(filePath)}" could not be read.`,
      { cause: err }
    )
  }

  let manifest: unknown

  try {
    manifest = parse(text)
  } catch (err) {
    throw new Error(
      `TOML file at "${colors.bold(filePath)}" could not be parsed.`,
      { cause: err }
    )
  }

  if (typeof manifest !== 'object' || manifest === null) {
    throw new Error(
      `TOML file at "${colors.bold(filePath)}" does not contain a valid object.`
    )
  }

  return manifest as CargoToml
}

/**
 * Determine whether a directory holds a Cargo manifest.
 *
 * @param dir Directory that may contain a Cargo manifest
 * @returns True when a `Cargo.toml` file exists in the directory
 */
export async function hasCargoManifest(dir: string): Promise<boolean> {
  try {
    await fs.access(path.join(dir, CARGO_MANIFEST_FILE))
    return true
  } catch {
    return false
  }
}
