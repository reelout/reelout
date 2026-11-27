// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { colors } from 'consola/utils'
import fs from 'node:fs/promises'
import path from 'node:path'
import { parse } from 'smol-toml'
import type { CargoToml } from './types'

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

  // The manifest structure is intentionally not validated here: downstream
  // consumers probe every field with typeof checks, so a foreign manifest
  // degrades to undefined fields instead of runtime errors.
  return manifest as CargoToml
}
