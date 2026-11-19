// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { comparePackageTarballs } from '@reelout/npm'
import { c as tarCreate } from 'tar'
import { temporaryDirectoryTask } from 'tempy'
import { expect, test } from 'vitest'

interface FixtureFile {
  path: string
  content: string
}

interface FixtureSymlink {
  path: string
  target: string
}

interface PackFixtureOptions {
  gzip?: boolean | { level: number }
  mtime?: Date
  portable?: boolean
  prefix?: string
  order?: string[]
  symlinks?: FixtureSymlink[]
}

let fixtureCounter = 0

async function packFixture(
  cwd: string,
  files: FixtureFile[],
  options: PackFixtureOptions = {}
): Promise<Buffer> {
  fixtureCounter += 1

  const stagingDir = path.join(cwd, `staging-${fixtureCounter}`)
  const tarballPath = path.join(cwd, `fixture-${fixtureCounter}.tgz`)

  for (const file of files) {
    const filePath = path.join(stagingDir, file.path)
    await mkdir(path.dirname(filePath), { recursive: true })
    await writeFile(filePath, file.content)
  }

  for (const link of options.symlinks ?? []) {
    await symlink(link.target, path.join(stagingDir, link.path))
  }

  const defaultOrder = [
    ...files.map((file) => file.path),
    ...(options.symlinks ?? []).map((link) => link.path),
  ]

  tarCreate.syncFile(
    {
      sync: true,
      file: tarballPath,
      cwd: stagingDir,
      gzip: options.gzip ?? true,
      ...(options.mtime !== undefined ? { mtime: options.mtime } : {}),
      ...(options.portable !== undefined ? { portable: options.portable } : {}),
      ...(options.prefix !== undefined ? { prefix: options.prefix } : {}),
    },
    options.order ?? defaultOrder
  )

  return readFile(tarballPath)
}

const defaultFiles: FixtureFile[] = [
  {
    path: 'package.json',
    content:
      JSON.stringify(
        { name: 'demo-lib', version: '1.0.0', main: 'src/index.js' },
        null,
        2
      ) + '\n',
  },
  { path: 'README.md', content: '# demo-lib\n\nA demo package.\n' },
  { path: 'src/index.js', content: 'export const value = 42\n' },
]

test('treats tarballs with identical logical content but different tar-level metadata as identical', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    const published = await packFixture(cwd, defaultFiles, {
      gzip: { level: 9 },
      mtime: new Date('2026-01-01T00:00:00.000Z'),
      portable: true,
      order: ['package.json', 'README.md', 'src/index.js'],
    })
    const local = await packFixture(cwd, defaultFiles, {
      gzip: { level: 1 },
      mtime: new Date('2026-06-15T12:30:00.000Z'),
      order: ['src/index.js', 'README.md', 'package.json'],
    })

    expect(published.equals(local)).toBe(false)
    expect(comparePackageTarballs(published, local)).toEqual({
      verdict: 'identical',
    })
  })
})

test('ignores directory entries and differing root folder prefixes', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    const published = await packFixture(cwd, defaultFiles, {
      prefix: 'package',
      order: ['package.json', 'README.md', 'src'],
    })
    const local = await packFixture(cwd, defaultFiles, {
      prefix: 'demo-lib@1.0.0',
      order: ['src/index.js', 'README.md', 'package.json'],
    })

    expect(comparePackageTarballs(published, local)).toEqual({
      verdict: 'identical',
    })
  })
})

test('treats a plain tarball and a gzipped tarball with the same content as identical', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    const published = await packFixture(cwd, defaultFiles, { gzip: false })
    const local = await packFixture(cwd, defaultFiles, { gzip: true })

    expect(comparePackageTarballs(published, local)).toEqual({
      verdict: 'identical',
    })
  })
})

test('reports differing file content as different with the file named in the summary', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    const published = await packFixture(cwd, defaultFiles)
    const local = await packFixture(
      cwd,
      defaultFiles.map((file) =>
        file.path === 'src/index.js'
          ? { ...file, content: 'export const value = 43\n' }
          : file
      )
    )

    expect(comparePackageTarballs(published, local)).toEqual({
      verdict: 'different',
      summary: 'different content in: src/index.js',
    })
  })
})

test('reports files present only in the published tarball as different', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    const published = await packFixture(cwd, defaultFiles)
    const local = await packFixture(
      cwd,
      defaultFiles.filter((file) => file.path !== 'README.md')
    )

    expect(comparePackageTarballs(published, local)).toEqual({
      verdict: 'different',
      summary: 'only in published tarball: README.md',
    })
  })
})

test('reports files present only in the local tarball as different', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    const published = await packFixture(
      cwd,
      defaultFiles.filter((file) => file.path !== 'README.md')
    )
    const local = await packFixture(cwd, defaultFiles)

    expect(comparePackageTarballs(published, local)).toEqual({
      verdict: 'different',
      summary: 'only in local tarball: README.md',
    })
  })
})

test('sorts files and names every difference group in the summary', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    const published = await packFixture(cwd, [
      {
        path: 'package.json',
        content: '{"name":"demo-lib","version":"1.0.0"}',
      },
      { path: 'B-extra.md', content: 'published b\n' },
      { path: 'A-extra.md', content: 'published a\n' },
      { path: 'src/index.js', content: 'export const value = 42\n' },
    ])
    const local = await packFixture(cwd, [
      {
        path: 'package.json',
        content: '{"name":"demo-lib","version":"1.0.0"}',
      },
      { path: 'src/index.js', content: 'export const value = 43\n' },
      { path: 'local-only.md', content: 'local only\n' },
    ])

    expect(comparePackageTarballs(published, local)).toEqual({
      verdict: 'different',
      summary:
        'different content in: src/index.js; only in published tarball: A-extra.md, B-extra.md; only in local tarball: local-only.md',
    })
  })
})

test('treats package.json differing only by publish-mutated fields as identical', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    const publishedManifest =
      JSON.stringify(
        {
          name: 'demo-lib',
          version: '1.0.0',
          _id: 'demo-lib@1.0.0',
          main: 'src/index.js',
          gitHead: '0123456789abcdef0123456789abcdef01234567',
        },
        null,
        2
      ) + '\n'
    const localManifest = JSON.stringify(
      { main: 'src/index.js', name: 'demo-lib', version: '1.0.0' },
      null,
      4
    )
    const filesFor = (manifest: string): FixtureFile[] => [
      { path: 'package.json', content: manifest },
      { path: 'src/index.js', content: 'export const value = 42\n' },
    ]

    const published = await packFixture(cwd, filesFor(publishedManifest))
    const local = await packFixture(cwd, filesFor(localManifest))

    expect(comparePackageTarballs(published, local)).toEqual({
      verdict: 'identical',
    })
  })
})

test('reports semantically different package.json content as different', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    const filesFor = (version: string): FixtureFile[] => [
      {
        path: 'package.json',
        content: `{"name":"demo-lib","version":"${version}"}`,
      },
      { path: 'src/index.js', content: 'export const value = 42\n' },
    ]

    const published = await packFixture(cwd, filesFor('1.0.0'))
    const local = await packFixture(cwd, filesFor('1.0.1'))

    expect(comparePackageTarballs(published, local)).toEqual({
      verdict: 'different',
      summary: 'different content in: package.json',
    })
  })
})

test('reports unparseable package.json content as different', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    const filesFor = (manifest: string): FixtureFile[] => [
      { path: 'package.json', content: manifest },
      { path: 'src/index.js', content: 'export const value = 42\n' },
    ]

    const published = await packFixture(cwd, filesFor('{invalid json'))
    const local = await packFixture(
      cwd,
      filesFor('{"name":"demo-lib","version":"1.0.0"}')
    )

    expect(comparePackageTarballs(published, local)).toEqual({
      verdict: 'different',
      summary: 'different content in: package.json',
    })
  })
})

test('treats matching symlink entries as identical', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    const files: FixtureFile[] = [
      {
        path: 'package.json',
        content: '{"name":"demo-lib","version":"1.0.0"}',
      },
      { path: 'index.js', content: 'export const value = 42\n' },
    ]
    const symlinks = [{ path: 'link.js', target: 'index.js' }]

    const published = await packFixture(cwd, files, { symlinks })
    const local = await packFixture(cwd, files, { symlinks })

    expect(comparePackageTarballs(published, local)).toEqual({
      verdict: 'identical',
    })
  })
})

test('reports symlink entries with different targets as different', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    const files: FixtureFile[] = [
      {
        path: 'package.json',
        content: '{"name":"demo-lib","version":"1.0.0"}',
      },
      { path: 'index.js', content: 'export const value = 42\n' },
    ]

    const published = await packFixture(cwd, files, {
      symlinks: [{ path: 'link.js', target: 'index.js' }],
    })
    const local = await packFixture(cwd, files, {
      symlinks: [{ path: 'link.js', target: 'other.js' }],
    })

    expect(comparePackageTarballs(published, local)).toEqual({
      verdict: 'different',
      summary: 'different content in: link.js',
    })
  })
})

test('returns undeterminable for a corrupt published tarball', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    const local = await packFixture(cwd, defaultFiles)

    const result = comparePackageTarballs(
      Buffer.from('this is not a tarball at all'),
      local
    )

    expect(result.verdict).toBe('undeterminable')
    expect(result).toMatchObject({
      reason: expect.stringContaining('published tarball'),
    })
  })
})

test('returns undeterminable for a corrupt local tarball', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    const published = await packFixture(cwd, defaultFiles)

    const result = comparePackageTarballs(
      published,
      Buffer.from('this is not a tarball at all')
    )

    expect(result.verdict).toBe('undeterminable')
    expect(result).toMatchObject({
      reason: expect.stringContaining('local tarball'),
    })
  })
})

test('returns undeterminable for a truncated gzip tarball', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    const tarball = await packFixture(cwd, defaultFiles)

    const result = comparePackageTarballs(tarball.subarray(0, 30), tarball)

    expect(result.verdict).toBe('undeterminable')
    expect(result).toMatchObject({
      reason: expect.stringContaining('published tarball'),
    })
  })
})

test('returns undeterminable for an empty tarball buffer', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    const tarball = await packFixture(cwd, defaultFiles)

    const result = comparePackageTarballs(tarball, Buffer.alloc(0))

    expect(result.verdict).toBe('undeterminable')
    expect(result).toMatchObject({
      reason: expect.stringContaining('local tarball'),
    })
  })
})
