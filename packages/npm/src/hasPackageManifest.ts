// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import fs from 'node:fs/promises'
import path from 'node:path'

/**
 * Determine whether a directory holds a package manifest.
 *
 * @param dir Directory that may contain a package manifest
 * @returns True when a `package.json` file exists in the directory
 */
export async function hasPackageManifest(dir: string): Promise<boolean> {
  try {
    await fs.access(path.join(dir, 'package.json'))
    return true
  } catch {
    return false
  }
}
