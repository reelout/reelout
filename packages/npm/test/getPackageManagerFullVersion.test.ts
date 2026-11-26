// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { getPackageManagerFullVersion } from '@reelout/npm'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { temporaryDirectoryTask } from 'tempy'
import { expect, test } from 'vitest'

/**
 * Create a fake package manager executable that shadows the real one on
 * `PATH`.
 *
 * @param cwd The temporary directory that holds the shadowing `bin` directory
 * @param name The executable's file name
 * @param script The shell script the executable runs
 * @returns The `PATH` value that resolves the executable first
 */
async function shadowPackageManager(
  cwd: string,
  name: string,
  script: string
): Promise<string> {
  const binDir = path.join(cwd, 'bin')

  await mkdir(binDir)

  await writeFile(path.join(binDir, name), script, { mode: 0o755 })

  return [binDir, process.env.PATH].filter(Boolean).join(path.delimiter)
}

test('retrieves the full version', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    const PATH = await shadowPackageManager(
      cwd,
      'npm',
      "#!/bin/sh\necho '11.5.0'\n"
    )

    expect(
      await getPackageManagerFullVersion(cwd, 'npm', { env: { PATH } })
    ).toBe('11.5.0')
  })
})

test('returns undefined for non-semver output', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    const PATH = await shadowPackageManager(
      cwd,
      'npm',
      "#!/bin/sh\necho 'not-a-version'\n"
    )

    expect(
      await getPackageManagerFullVersion(cwd, 'npm', { env: { PATH } })
    ).toBe(undefined)
  })
})

test('returns undefined when the version command fails', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    const PATH = await shadowPackageManager(cwd, 'npm', '#!/bin/sh\nexit 1\n')

    expect(
      await getPackageManagerFullVersion(cwd, 'npm', { env: { PATH } })
    ).toBe(undefined)
  })
})
