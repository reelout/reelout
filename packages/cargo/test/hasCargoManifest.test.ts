// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { CARGO_MANIFEST_FILE, hasCargoManifest } from '@reelout/cargo'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { temporaryDirectoryTask } from 'tempy'
import { expect, test } from 'vitest'

test('detects whether a directory holds a Cargo manifest', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    expect(await hasCargoManifest(cwd)).toBe(false)

    await writeFile(path.join(cwd, CARGO_MANIFEST_FILE), '[package]\n')

    expect(await hasCargoManifest(cwd)).toBe(true)
  })
})
