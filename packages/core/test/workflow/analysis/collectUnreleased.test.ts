// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import {
  collectUnreleased,
  execGit,
  type SliceUnreleasedOptions,
} from '@reelout/core'
import { updatePackageJson, writePackageJson } from '@reelout/npm'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { temporaryDirectoryTask } from 'tempy'
import { expect, test } from 'vitest'
import { initializeGitRepository } from '../../../../../test/mock/git'

async function showWindow(
  cwd: string,
  options?: SliceUnreleasedOptions
): Promise<{ history: string[]; stop: string | null }> {
  const window = await collectUnreleased(cwd, options)

  return {
    history: window.history.toReversed().map((commit) => commit.header),
    stop: window.stop?.header ?? null,
  }
}

test('collects all commits and reports no stop when no release commit exists', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    await initializeGitRepository(cwd)

    await writePackageJson(cwd, { version: '0.0.0' })
    await execGit(cwd, ['add', '.'])
    await execGit(cwd, ['commit', '-m', 'chore: add manifest'])

    await writeFile(path.join(cwd, 'index.js'), 'export const foo = 1;')
    await execGit(cwd, ['add', '.'])
    await execGit(cwd, ['commit', '-m', 'feat: add entry'])

    expect(await showWindow(cwd)).toMatchInlineSnapshot(`
      {
        "history": [
          "chore: add manifest",
          "feat: add entry",
        ],
        "stop": null,
      }
    `)
  })
})

test('returns the unreleased window and the release commit that stopped it', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    await initializeGitRepository(cwd)

    await writePackageJson(cwd, { version: '0.0.0' })
    await execGit(cwd, ['add', '.'])
    await execGit(cwd, ['commit', '-m', 'chore: add manifest'])

    await updatePackageJson(cwd, { version: '1.0.0' })
    await execGit(cwd, ['add', '.'])
    await execGit(cwd, ['commit', '-m', 'chore: release 1.0.0'])
    await execGit(cwd, ['tag', 'v1.0.0'])

    await writeFile(path.join(cwd, 'index.js'), 'export const foo = 1;')
    await execGit(cwd, ['add', '.'])
    await execGit(cwd, ['commit', '-m', 'feat: add entry'])

    expect(await showWindow(cwd)).toMatchInlineSnapshot(`
      {
        "history": [
          "feat: add entry",
        ],
        "stop": "chore: release 1.0.0",
      }
    `)
  })
})

test('returns an empty history with the release stop when HEAD is a release commit', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    await initializeGitRepository(cwd)

    await writePackageJson(cwd, { version: '0.0.0' })
    await execGit(cwd, ['add', '.'])
    await execGit(cwd, ['commit', '-m', 'chore: add manifest'])

    await updatePackageJson(cwd, { version: '1.0.0' })
    await execGit(cwd, ['add', '.'])
    await execGit(cwd, ['commit', '-m', 'chore: release 1.0.0'])
    await execGit(cwd, ['tag', 'v1.0.0'])

    expect(await showWindow(cwd)).toMatchInlineSnapshot(`
      {
        "history": [],
        "stop": "chore: release 1.0.0",
      }
    `)
  })
})

test('respects custom release marker option instead of falling back to default', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    await initializeGitRepository(cwd)

    await writeFile(path.join(cwd, 'a.txt'), 'a')
    await execGit(cwd, ['add', '.'])
    await execGit(cwd, [
      'commit',
      '-m',
      'chore: create initial configuration file [q101-aa]\n\nRelease-As: v1.0.0',
    ])

    await writeFile(path.join(cwd, 'b.txt'), 'b')
    await execGit(cwd, ['add', '.'])
    await execGit(cwd, [
      'commit',
      '-m',
      'feat: add custom marker parser strategy [r202-bb]',
    ])

    expect(await showWindow(cwd, { marker: 'Release-As' }))
      .toMatchInlineSnapshot(`
      {
        "history": [
          "feat: add custom marker parser strategy [r202-bb]",
        ],
        "stop": "chore: create initial configuration file [q101-aa]",
      }
    `)
  })
})
