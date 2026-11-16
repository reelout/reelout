// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import {
  execGit,
  getParsedGitCommit,
  isFilteredReleaseCommit,
} from '@reelout/core'
import { temporaryDirectoryTask } from 'tempy'
import { expect, test } from 'vitest'
import { initializeGitRepository } from '../../../../../test/mock/git'

async function createCommit(cwd: string, message: string) {
  await execGit(cwd, ['commit', '--allow-empty', '-m', message])
}

test('returns false when commit is null or undefined', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    await initializeGitRepository(cwd)

    expect(await isFilteredReleaseCommit(cwd, null)).toBe(false)

    expect(await isFilteredReleaseCommit(cwd, undefined)).toBe(false)
  })
})

test('returns false when commit carries no release filter trailer', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    await initializeGitRepository(cwd)

    await createCommit(cwd, 'feat: add feature')

    expect(await isFilteredReleaseCommit(cwd, 'HEAD')).toBe(false)
  })
})

test('returns true when commit reference carries a release filter trailer', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    await initializeGitRepository(cwd)

    await createCommit(
      cwd,
      'chore: release pkg-a\n\nRelease-Filter: pkg-a, !pkg-b'
    )

    expect(await isFilteredReleaseCommit(cwd, 'HEAD')).toBe(true)
  })
})

test('returns true when pre-parsed commit object resolves to a filtered release commit', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    await initializeGitRepository(cwd)

    await createCommit(
      cwd,
      'chore: release pkg-a\n\nRelease-Filter: @scope/pkg-*'
    )

    const commit = await getParsedGitCommit(cwd, 'HEAD')

    expect(await isFilteredReleaseCommit(cwd, commit)).toBe(true)
  })
})

test('returns false when commit reference is missing', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    await initializeGitRepository(cwd)

    expect(await isFilteredReleaseCommit(cwd, 'non-existent-ref')).toBe(false)
  })
})
