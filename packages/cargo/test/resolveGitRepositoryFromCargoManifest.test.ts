// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { resolveGitRepositoryFromCargoManifest } from '@reelout/cargo'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { temporaryDirectoryTask } from 'tempy'
import { expect, test } from 'vitest'
import { context } from '../../../test/mock/context'

test('resolves GitHub repository metadata from the root manifest', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    await writeFile(
      path.join(cwd, 'Cargo.toml'),
      [
        '[package]',
        'name = "a"',
        'version = "1.2.3"',
        'repository = "https://github.com/user/repo.git"',
        '',
      ].join('\n')
    )

    expect(await resolveGitRepositoryFromCargoManifest(cwd, context)).toEqual({
      host: 'github',
      owner: 'user',
      repo: 'repo',
      url: 'https://github.com/user/repo',
    })
  })
})

test('resolves GitLab repository metadata from the root manifest', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    await writeFile(
      path.join(cwd, 'Cargo.toml'),
      [
        '[package]',
        'name = "a"',
        'version = "1.2.3"',
        'repository = "https://gitlab.com/user/repo.git"',
        '',
      ].join('\n')
    )

    expect(await resolveGitRepositoryFromCargoManifest(cwd, context)).toEqual({
      host: 'gitlab',
      owner: 'user',
      repo: 'repo',
      url: 'https://gitlab.com/user/repo',
    })
  })
})

test('returns null when the manifest defines no repository', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    await writeFile(
      path.join(cwd, 'Cargo.toml'),
      '[package]\nname = "a"\nversion = "1.2.3"\n'
    )

    expect(await resolveGitRepositoryFromCargoManifest(cwd, context)).toBe(null)
  })
})

test('returns null when the repository points at a local path', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    await writeFile(
      path.join(cwd, 'Cargo.toml'),
      [
        '[package]',
        'name = "a"',
        'version = "1.2.3"',
        'repository = "../local"',
        '',
      ].join('\n')
    )

    expect(await resolveGitRepositoryFromCargoManifest(cwd, context)).toBe(null)
  })
})

test('returns null when the repository host is unsupported', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    await writeFile(
      path.join(cwd, 'Cargo.toml'),
      [
        '[package]',
        'name = "a"',
        'version = "1.2.3"',
        'repository = "https://example.com/user/repo.git"',
        '',
      ].join('\n')
    )

    expect(await resolveGitRepositoryFromCargoManifest(cwd, context)).toBe(null)
  })
})

test('returns null when no root manifest exists', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    expect(await resolveGitRepositoryFromCargoManifest(cwd, context)).toBe(null)
  })
})

test('returns null when the manifest is invalid TOML', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    await writeFile(path.join(cwd, 'Cargo.toml'), '[package\nname = "a"\n')

    expect(await resolveGitRepositoryFromCargoManifest(cwd, context)).toBe(null)
  })
})
