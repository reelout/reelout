// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import {
  execGit,
  sliceUnreleasedForPackage,
  type Package,
  type UnreleasedOptions,
} from '@reelout/core'
import { buildPackage, updatePackageJson, writePackageJson } from '@reelout/npm'
import { fromAsync } from 'from-async'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { temporaryDirectoryTask } from 'tempy'
import { beforeEach, expect, test } from 'vitest'
import { workspace } from '../../../../../test/mock/context'
import { initializeGitRepository } from '../../../../../test/mock/git'

async function showCommits(
  cwd: string,
  pkg: Package,
  options?: UnreleasedOptions
): Promise<string[]> {
  return (await fromAsync(sliceUnreleasedForPackage(cwd, pkg, options)))
    .toReversed()
    .map((commit) => commit.header)
}

beforeEach(() => {
  workspace.entry = '.'
  workspace.members = ['*']
})

test('yields the full package history when the package was never released', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    await initializeGitRepository(cwd)

    const pkgDir1 = path.join(cwd, 'pkg1')
    const pkgDir2 = path.join(cwd, 'pkg2')

    await writePackageJson(pkgDir1, { name: 'pkg1', version: '1.0.0' })
    await writePackageJson(pkgDir2, { name: 'pkg2', version: '1.0.0' })
    await execGit(cwd, ['add', '.'])
    await execGit(cwd, ['commit', '-m', 'chore: initialize packages'])

    await writeFile(path.join(pkgDir1, 'index.js'), 'export const v1 = 1;')
    await execGit(cwd, ['add', '.'])
    await execGit(cwd, ['commit', '-m', 'feat(pkg1): add entry'])

    await updatePackageJson(pkgDir2, { version: '1.1.0' })
    await execGit(cwd, ['add', '.'])
    await execGit(cwd, ['commit', '-m', 'chore: release pkg2'])
    await execGit(cwd, ['tag', 'pkg2@1.1.0'])

    await writeFile(path.join(pkgDir1, 'index.js'), 'export const v1 = 2;')
    await execGit(cwd, ['add', '.'])
    await execGit(cwd, ['commit', '-m', 'fix(pkg1): update entry'])

    const pkg1 = await buildPackage({
      rootDir: cwd,
      packageDir: 'pkg1',
      workspace,
      packageManager: 'npm',
    })

    expect(await showCommits(cwd, pkg1)).toMatchInlineSnapshot(`
      [
        "chore: initialize packages",
        "feat(pkg1): add entry",
        "fix(pkg1): update entry",
      ]
    `)
  })
})

test('stops at the package release boundary while ignoring foreign release commits', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    await initializeGitRepository(cwd)

    const pkgDir1 = path.join(cwd, 'pkg1')
    const pkgDir2 = path.join(cwd, 'pkg2')

    await writePackageJson(pkgDir1, { name: 'pkg1', version: '1.0.0' })
    await writePackageJson(pkgDir2, { name: 'pkg2', version: '1.0.0' })
    await execGit(cwd, ['add', '.'])
    await execGit(cwd, ['commit', '-m', 'chore: initialize packages'])

    await writeFile(path.join(pkgDir1, 'index.js'), 'export const v1 = 1;')
    await execGit(cwd, ['add', '.'])
    await execGit(cwd, ['commit', '-m', 'feat(pkg1): add entry'])

    await updatePackageJson(pkgDir1, { version: '1.1.0' })
    await execGit(cwd, ['add', '.'])
    await execGit(cwd, ['commit', '-m', 'chore: release pkg1'])
    await execGit(cwd, ['tag', 'pkg1@1.1.0'])

    await writeFile(path.join(pkgDir2, 'index.js'), 'export const v2 = 1;')
    await execGit(cwd, ['add', '.'])
    await execGit(cwd, ['commit', '-m', 'feat(pkg2): add entry'])

    await updatePackageJson(pkgDir2, { version: '1.1.0' })
    await execGit(cwd, ['add', '.'])
    await execGit(cwd, ['commit', '-m', 'chore: release pkg2'])
    await execGit(cwd, ['tag', 'pkg2@1.1.0'])

    await writeFile(path.join(pkgDir1, 'index.js'), 'export const v1 = 2;')
    await execGit(cwd, ['add', '.'])
    await execGit(cwd, ['commit', '-m', 'fix(pkg1): update entry'])

    await writeFile(path.join(pkgDir2, 'index.js'), 'export const v2 = 2;')
    await execGit(cwd, ['add', '.'])
    await execGit(cwd, ['commit', '-m', 'fix(pkg2): update entry'])

    const pkg1 = await buildPackage({
      rootDir: cwd,
      packageDir: 'pkg1',
      workspace,
      packageManager: 'npm',
    })
    const pkg2 = await buildPackage({
      rootDir: cwd,
      packageDir: 'pkg2',
      workspace,
      packageManager: 'npm',
    })

    expect(await showCommits(cwd, pkg1)).toMatchInlineSnapshot(`
      [
        "fix(pkg1): update entry",
      ]
    `)
    expect(await showCommits(cwd, pkg2)).toMatchInlineSnapshot(`
      [
        "fix(pkg2): update entry",
      ]
    `)
  })
})

test('skips filtered release commits that excluded the package and keeps walking', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    await initializeGitRepository(cwd)

    const pkgDir1 = path.join(cwd, 'pkg1')
    const pkgDir2 = path.join(cwd, 'pkg2')

    await writePackageJson(pkgDir1, { name: 'pkg1', version: '1.0.0' })
    await writePackageJson(pkgDir2, { name: 'pkg2', version: '1.0.0' })
    await execGit(cwd, ['add', '.'])
    await execGit(cwd, ['commit', '-m', 'chore: initialize packages'])

    await writeFile(path.join(pkgDir1, 'index.js'), 'export const v1 = 1;')
    await execGit(cwd, ['add', '.'])
    await execGit(cwd, ['commit', '-m', 'feat(pkg1): add entry'])

    await writeFile(path.join(pkgDir2, 'index.js'), 'export const v2 = 1;')
    await execGit(cwd, ['add', '.'])
    await execGit(cwd, ['commit', '-m', 'feat(pkg2): add entry'])

    await updatePackageJson(pkgDir2, { version: '1.1.0' })
    await updatePackageJson(pkgDir1, { dependencies: { pkg2: '^1.1.0' } })
    await execGit(cwd, ['add', '.'])
    await execGit(cwd, [
      'commit',
      '-m',
      'chore: release pkg2\n\nRelease-Filter: pkg2',
    ])
    await execGit(cwd, ['tag', 'pkg2@1.1.0'])

    await writeFile(path.join(pkgDir1, 'index.js'), 'export const v1 = 2;')
    await execGit(cwd, ['add', '.'])
    await execGit(cwd, ['commit', '-m', 'fix(pkg1): update entry'])

    const pkg1 = await buildPackage({
      rootDir: cwd,
      packageDir: 'pkg1',
      workspace,
      packageManager: 'npm',
    })
    const pkg2 = await buildPackage({
      rootDir: cwd,
      packageDir: 'pkg2',
      workspace,
      packageManager: 'npm',
    })

    expect(await showCommits(cwd, pkg1)).toMatchInlineSnapshot(`
      [
        "chore: initialize packages",
        "feat(pkg1): add entry",
        "fix(pkg1): update entry",
      ]
    `)

    expect(await showCommits(cwd, pkg2)).toMatchInlineSnapshot(`
      []
    `)
  })
})

test('respects custom release marker option instead of falling back to default', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    await initializeGitRepository(cwd)

    const pkgDir = path.join(cwd, 'pkg1')

    await writePackageJson(pkgDir, { name: 'pkg1', version: '1.0.0' })
    await execGit(cwd, ['add', '.'])
    await execGit(cwd, [
      'commit',
      '-m',
      'chore: initialize packages\n\nRelease-As: v1.0.0',
    ])

    await writeFile(path.join(pkgDir, 'index.js'), 'export const v1 = 1;')
    await execGit(cwd, ['add', '.'])
    await execGit(cwd, ['commit', '-m', 'feat(pkg1): add entry'])

    const pkg1 = await buildPackage({
      rootDir: cwd,
      packageDir: 'pkg1',
      workspace,
      packageManager: 'npm',
    })

    expect(await showCommits(cwd, pkg1, { marker: 'Release-As' }))
      .toMatchInlineSnapshot(`
      [
        "feat(pkg1): add entry",
      ]
    `)

    expect(await showCommits(cwd, pkg1)).toMatchInlineSnapshot(`
      [
        "chore: initialize packages",
        "feat(pkg1): add entry",
      ]
    `)
  })
})

test('yields no commits when package directory does not exist', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    await initializeGitRepository(cwd)

    await writePackageJson(cwd, { version: '1.0.0' })
    await execGit(cwd, ['add', '.'])
    await execGit(cwd, ['commit', '-m', 'chore: initial commit'])

    const pkg = { location: 'non-existent-pkg', files: '**/*' } as Package

    expect(await showCommits(cwd, pkg)).toEqual([])
  })
})
