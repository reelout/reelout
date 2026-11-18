// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { execGit, listGitTags } from '@reelout/core'
import { temporaryDirectoryTask } from 'tempy'
import { expect, test } from 'vitest'
import { initializeGitRepository } from '../../../../../test/mock/git'

test('lists tags in the repository', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    await initializeGitRepository(cwd)

    expect(await listGitTags(cwd)).toEqual([])

    await execGit(cwd, ['commit', '--allow-empty', '-m', 'Initial commit'])
    await execGit(cwd, ['tag', 'foo@1.0.0'])
    await execGit(cwd, ['tag', 'v2.0.0'])
    await execGit(cwd, ['tag', 'v1.0.0', '-a', '-m', 'Annotated tag'])

    expect(await listGitTags(cwd)).toEqual(['foo@1.0.0', 'v1.0.0', 'v2.0.0'])
  })
})
