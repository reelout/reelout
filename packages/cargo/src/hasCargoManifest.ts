// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import fs from 'node:fs/promises'
import path from 'node:path'
import { CARGO_MANIFEST_FILE } from './readCargoToml'

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
