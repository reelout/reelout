// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { isPackageTarballIdentical } from '@reelout/npm'
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
    expect(isPackageTarballIdentical(published, local)).toBe(true)
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

    expect(isPackageTarballIdentical(published, local)).toBe(true)
  })
})

test('keeps multi-root paths intact instead of stripping the first folder', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    const published = await packFixture(cwd, [
      { path: 'app/shared.txt', content: 'shared content\n' },
      { path: 'lib/data.txt', content: 'lib data\n' },
    ])
    const local = await packFixture(cwd, [
      { path: 'application/shared.txt', content: 'shared content\n' },
      { path: 'lib/data.txt', content: 'lib data\n' },
    ])

    expect(isPackageTarballIdentical(published, local)).toBe(false)
  })
})

test('treats a plain tarball and a gzipped tarball with the same content as identical', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    const published = await packFixture(cwd, defaultFiles, { gzip: false })
    const local = await packFixture(cwd, defaultFiles, { gzip: true })

    expect(isPackageTarballIdentical(published, local)).toBe(true)
  })
})

test('reports differing file content as not identical', async () => {
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

    expect(isPackageTarballIdentical(published, local)).toBe(false)
  })
})

test('reports files present only in the published tarball as not identical', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    const published = await packFixture(cwd, defaultFiles)
    const local = await packFixture(
      cwd,
      defaultFiles.filter((file) => file.path !== 'README.md')
    )

    expect(isPackageTarballIdentical(published, local)).toBe(false)
  })
})

test('reports files present only in the local tarball as not identical', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    const published = await packFixture(
      cwd,
      defaultFiles.filter((file) => file.path !== 'README.md')
    )
    const local = await packFixture(cwd, defaultFiles)

    expect(isPackageTarballIdentical(published, local)).toBe(false)
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

    expect(isPackageTarballIdentical(published, local)).toBe(true)
  })
})

test('reports semantically different package.json content as not identical', async () => {
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

    expect(isPackageTarballIdentical(published, local)).toBe(false)
  })
})

test('reports unparseable package.json content as not identical', async () => {
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

    expect(isPackageTarballIdentical(published, local)).toBe(false)
  })
})

test('reports package.json that is valid JSON but not an object as not identical', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    const filesFor = (manifest: string): FixtureFile[] => [
      { path: 'package.json', content: manifest },
      { path: 'src/index.js', content: 'export const value = 42\n' },
    ]

    const published = await packFixture(cwd, filesFor('null'))
    const local = await packFixture(
      cwd,
      filesFor('{"name":"demo-lib","version":"1.0.0"}')
    )

    expect(isPackageTarballIdentical(published, local)).toBe(false)
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

    expect(isPackageTarballIdentical(published, local)).toBe(true)
  })
})

test('reports symlink entries with different targets as not identical', async () => {
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

    expect(isPackageTarballIdentical(published, local)).toBe(false)
  })
})

test('reports a symlink replaced by a regular file as not identical', async () => {
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
    const local = await packFixture(cwd, [
      ...files,
      { path: 'link.js', content: 'export const value = 42\n' },
    ])

    expect(isPackageTarballIdentical(published, local)).toBe(false)
  })
})

test('reports a corrupt published tarball as not identical', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    const local = await packFixture(cwd, defaultFiles)

    expect(
      isPackageTarballIdentical(
        Buffer.from('this is not a tarball at all'),
        local
      )
    ).toBe(false)
  })
})

test('reports a corrupt local tarball as not identical', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    const published = await packFixture(cwd, defaultFiles)

    expect(
      isPackageTarballIdentical(
        published,
        Buffer.from('this is not a tarball at all')
      )
    ).toBe(false)
  })
})

test('reports a truncated gzip tarball as not identical', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    const tarball = await packFixture(cwd, defaultFiles)

    expect(isPackageTarballIdentical(tarball.subarray(0, 30), tarball)).toBe(
      false
    )
  })
})
