// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import '../../../test/mock/env'
import '../../../test/mock/fs'

import {
  executeReleaseWorkflow,
  type GitCommit,
  type Package,
  type ReleasePlan,
  type ReleasePlugin,
} from '@reelout/core'
import plugin, {
  buildPackage,
  loadPackages,
  PLUGIN_NAME,
  writePackageJson,
} from '@reelout/npm'
import type { downloadPublishedTarball } from '@reelout/npm/downloadPublishedTarball'
import type { isPackageTarballIdentical } from '@reelout/npm/isPackageTarballIdentical'
import type { prepareAuth as prepareAuthImpl } from '@reelout/npm/prepareAuth'
import { vol } from 'memfs'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { temporaryDirectoryTask } from 'tempy'
import { c as tarCreate } from 'tar'
import { beforeEach, expect, test, vi } from 'vitest'
import {
  context,
  createMockRepository,
  logger,
  repository,
  workspace,
} from '../../../test/mock/context'
import { HOME_DIR } from '../../../test/mock/env'

const execCommand = vi.hoisted(() => vi.fn())

const prepareAuth = vi.hoisted(() =>
  vi.fn(async (...args: unknown[]): Promise<undefined> => {})
)

const publishPackage = vi.hoisted(() =>
  vi.fn(async (cwd: string, ...args: unknown[]) => await prepareAuth({ cwd }))
)

const isGitHubRepositoryPublic = vi.hoisted(() => vi.fn())

const isGitLabRepositoryPublic = vi.hoisted(() => vi.fn())

const isIdentical = vi.hoisted(() => vi.fn())

const downloadTarball = vi.hoisted(() => vi.fn())

const resolvePackageManager = vi.hoisted(() => vi.fn())

const getPackageManagerVersion = vi.hoisted(() => vi.fn())

const verifyTrustedPublishing = vi.hoisted(() => vi.fn())

vi.mock(import('@reelout/core/util/execCommand'), () => ({
  execCommand: (command, args, options) => execCommand(command, args, options),
}))

vi.mock(
  import('@reelout/npm/downloadPublishedTarball'),
  async (importOriginal) => {
    const actual = await importOriginal<{
      downloadPublishedTarball: typeof downloadPublishedTarball
    }>()

    return {
      downloadPublishedTarball: (
        ...args: Parameters<typeof actual.downloadPublishedTarball>
      ) => downloadTarball(...args) ?? actual.downloadPublishedTarball(...args),
    }
  }
)

vi.mock(
  import('@reelout/npm/isPackageTarballIdentical'),
  async (importOriginal) => {
    const actual = await importOriginal<{
      isPackageTarballIdentical: typeof isPackageTarballIdentical
    }>()

    return {
      isPackageTarballIdentical: (published: Buffer, local: Buffer) =>
        isIdentical(published, local) ??
        actual.isPackageTarballIdentical(published, local),
    }
  }
)

vi.mock(import('@reelout/npm/getPackageManagerVersion'), () => ({
  getPackageManagerVersion,
}))

vi.mock(import('@reelout/npm/loadPackages'), async (importActual) => ({
  loadPackages: vi.fn((await importActual()).loadPackages),
}))

vi.mock(import('@reelout/npm/prepareAuth'), async (importOriginal) => {
  const actual = await importOriginal<{
    prepareAuth: typeof prepareAuthImpl
  }>()

  return {
    prepareAuth: async (...args: Parameters<typeof prepareAuthImpl>) =>
      (await prepareAuth(...args)) ?? (await actual.prepareAuth(...args)),
  }
})

vi.mock(import('@reelout/npm/publishPackage'), () => ({
  publishPackage: (context, ...args) => publishPackage(context.cwd, ...args),
}))

vi.mock(import('@reelout/npm/resolvePackageManager'), () => ({
  resolvePackageManager,
}))

vi.mock(import('@reelout/npm/verifyTrustedPublishing'), () => ({
  verifyTrustedPublishing,
}))

vi.mock(import('@reelout/github/isRepositoryPublic'), () => ({
  isRepositoryPublic: isGitHubRepositoryPublic,
}))

vi.mock(import('@reelout/gitlab/isRepositoryPublic'), () => ({
  isRepositoryPublic: isGitLabRepositoryPublic,
}))

const provideAmbientAuth = () =>
  writeFile(
    path.join(HOME_DIR, '.npmrc'),
    '//registry.npmjs.org/:_authToken=mock-ambient-token\n'
  )

const NPMJS = 'https://registry.npmjs.org/'

interface CreateReleasePlanOptions {
  name?: string | undefined
  location: string
  releaseVersion?: string | null | undefined
  private?: boolean | undefined
  provider?: string | undefined
}

function createReleasePlan(options: CreateReleasePlanOptions): ReleasePlan {
  return {
    package: {
      provider: options.provider ?? PLUGIN_NAME,
      name: options.name,
      version: '1.2.2',
      private: options.private ?? false,
      root: false,
      entry: false,
      dependencies: [],
      location: options.location,
    },
    history: [],
    release:
      options.releaseVersion == null
        ? null
        : { type: 'patch', version: options.releaseVersion },
  }
}

function createCompleteReleasePlan(
  options: Partial<CreateReleasePlanOptions> = {}
): ReleasePlan {
  return createReleasePlan({
    name: 'a',
    location: 'a',
    releaseVersion: '1.2.3',
    ...options,
  })
}

async function writePackedTarball(
  args: readonly string[],
  content: string | Buffer
): Promise<void> {
  const flag = ['--pack-destination', '--filename', '--out'].find((candidate) =>
    args.includes(candidate)
  )

  if (!flag) {
    throw new Error(`No pack destination flag found in: ${args.join(' ')}`)
  }

  const destination = args[args.indexOf(flag) + 1]

  if (destination === undefined) {
    throw new Error(
      `No pack destination found after ${flag} in: ${args.join(' ')}`
    )
  }

  const filePath =
    flag === '--pack-destination'
      ? path.join(destination, 'package.tgz')
      : destination

  await writeFile(filePath, content)
}

function publishedManifest(
  distTags: Record<string, string> = { latest: '1.0.0' },
  integrity?: string
): string {
  return JSON.stringify({
    _id: 'a@1.2.3',
    name: 'a',
    version: '1.2.3',
    dist: { tarball: `${NPMJS}a/-/a-1.2.3.tgz`, integrity },
    'dist-tags': distTags,
  })
}

const notFoundError = () =>
  new Error(
    `Command 'npm view a@1.2.3 --json --registry ${NPMJS}' failed (exit code 1)
npm error code E404
npm error 404 No match found for version 1.2.3`
  )

const publishOverError = () =>
  new Error(
    `Command 'npm publish' failed (exit code 1)
npm error code EPUBLISHCONFLICT
npm error 409 Conflict - You cannot publish over the previously published versions: 1.2.3.`
  )

const stageRequiredError = () =>
  new Error(
    `Command 'npm publish' failed (exit code 1)
npm error code E_STAGE_REQUIRED
npm error 403 Forbidden - direct publishing is disabled for this package: use staged publishing`
  )

const provideOIDCAuth = () => {
  context.env = { NPM_ID_TOKEN: 'mock-id-token' }
}

function mountPackageFixture(): void {
  vol.fromJSON({
    '/repo/a/package.json': JSON.stringify({ name: 'a', version: '1.2.2' }),
    '/repo/b/package.json': JSON.stringify({ name: 'b', version: '2.0.0' }),
    '/repo/c/package.json': JSON.stringify({ name: 'c', version: '3.0.0' }),
  })
}

const warnCalls = (): string[] =>
  logger.mock.calls.flatMap(([message]) =>
    typeof message === 'string' ? [message] : []
  )

let fixtureCounter = 0

interface FixtureFile {
  path: string
  content: string
}

async function packFixtureTarball(
  files: FixtureFile[],
  options: { prefix?: string; mtime?: Date } = {}
): Promise<Buffer> {
  fixtureCounter += 1

  return await temporaryDirectoryTask(async (cwd) => {
    const stagingDir = path.join(cwd, 'staging')

    for (const file of files) {
      const filePath = path.join(stagingDir, file.path)

      await mkdir(path.dirname(filePath), { recursive: true })
      await writeFile(filePath, file.content)
    }

    const tarballPath = path.join(cwd, `fixture-${fixtureCounter}.tgz`)

    tarCreate.syncFile(
      {
        sync: true,
        file: tarballPath,
        cwd: stagingDir,
        gzip: true,
        ...(options.prefix !== undefined ? { prefix: options.prefix } : {}),
        ...(options.mtime !== undefined ? { mtime: options.mtime } : {}),
      },
      files.map((file) => file.path)
    )

    return await readFile(tarballPath)
  })
}

const fixtureFiles: FixtureFile[] = [
  {
    path: 'package.json',
    content: JSON.stringify({ name: 'a', version: '1.2.3' }),
  },
  { path: 'index.js', content: 'export const value = 42\n' },
]

beforeEach(() => {
  vi.resetAllMocks()

  resolvePackageManager.mockResolvedValue('npm')

  execCommand.mockImplementation(
    async (command: string, args: readonly string[]) => {
      if (args.includes('whoami')) return ''

      if (args.includes('view') || args.includes('info')) {
        throw notFoundError()
      }

      if (args.includes('pack')) {
        await writePackedTarball(args, 'packed-tarball')
        return ''
      }

      return ''
    }
  )

  downloadTarball.mockRejectedValue(
    new Error('downloadPublishedTarball was not configured for this test')
  )
})

test('preserves null repository context when omitted from package manifest and git remote', async () => {
  await writePackageJson(context.cwd, {})

  context.repository = null

  await executeReleaseWorkflow(context, [plugin()])

  expect(context.repository).toBe(null)
})

test('overrides repository context with manifest configuration when package manifest defines repository', async () => {
  await writePackageJson(context.cwd, {
    repository: {
      type: 'git',
      url: 'https://github.com/user/repo2.git',
    },
  })

  context.repository = createMockRepository('gitlab')

  await executeReleaseWorkflow(context, [plugin()])

  expect(context.repository).toEqual({
    host: 'github',
    owner: 'user',
    repo: 'repo2',
    url: 'https://github.com/user/repo2',
  })
})

test('resolves workspace members when defined in package.json or pnpm-workspace.yaml', async () => {
  const plugins = [plugin({ workspace })]

  vi.mocked(loadPackages).mockClear()

  await executeReleaseWorkflow(context, plugins)

  expect(vi.mocked(loadPackages).mock.calls).toMatchInlineSnapshot(`
    [
      [
        "/repo",
        {
          "entry": ".",
          "members": null,
        },
      ],
    ]
  `)

  vol.fromJSON({
    '/repo/package.json': JSON.stringify({ workspaces: ['packages/*'] }),
  })

  vi.mocked(loadPackages).mockClear()

  await executeReleaseWorkflow(context, plugins)

  expect(vi.mocked(loadPackages).mock.calls).toMatchInlineSnapshot(`
    [
      [
        "/repo",
        {
          "entry": ".",
          "members": [
            "packages/*",
          ],
        },
      ],
    ]
  `)

  vol.fromJSON({
    '/repo/pnpm-workspace.yaml': 'packages:\n  - "apps/*"\n  - "packages/*"',
  })

  vi.mocked(loadPackages).mockClear()

  await executeReleaseWorkflow(context, plugins)

  expect(vi.mocked(loadPackages).mock.calls).toMatchInlineSnapshot(`
    [
      [
        "/repo",
        {
          "entry": ".",
          "members": [
            "apps/*",
            "packages/*",
          ],
        },
      ],
    ]
  `)
})

test('preserves configured workspace members when workspace options are explicitly provided', async () => {
  workspace.entry = '.'
  workspace.members = ['apps/*']

  vol.fromJSON({
    '/repo/package.json': JSON.stringify({ workspaces: ['packages/*'] }),
  })

  await executeReleaseWorkflow(context, [plugin({ workspace })])

  expect(vi.mocked(loadPackages).mock.calls).toMatchInlineSnapshot(`
    [
      [
        "/repo",
        {
          "entry": ".",
          "members": [
            "apps/*",
          ],
        },
      ],
    ]
  `)
})

test('discovers valid packages and logs warnings when encountering invalid manifests', async () => {
  await provideAmbientAuth()

  workspace.entry = '.'
  workspace.members = ['packages/*']

  vol.fromJSON({
    '/repo/packages/foo/package.json': JSON.stringify({
      name: 'foo',
      version: '1.0.0',
      dependencies: { 'bar': 'workspace:^' },
    }),
    '/repo/packages/bar/package.json': JSON.stringify({
      name: 'bar',
      version: '1.0.0',
      dependencies: {},
    }),
    '/repo/packages/baz/package.json': JSON.stringify({
      name: 'baz',
      version: null,
      dependencies: {},
    }),
    '/repo/packages/qux/package.json': 'not a valid package.json',
    '/repo/pnpm-workspace.yaml': 'packages:\n  - packages/*',
    '/repo/package.json': JSON.stringify({
      version: '0.0.0',
      dependencies: { 'foo': 'workspace:^' },
    }),
  })

  context.packages = [
    {
      provider: undefined,
      entry: false,
      location: 'docs',
      dependencies: [] as string[],
    },
  ] as Package[]

  await executeReleaseWorkflow(context, [plugin()])

  expect(context.packages).toMatchInlineSnapshot(`
    [
      {
        "dependencies": [],
        "entry": false,
        "files": "packages/bar/**/*",
        "location": "packages/bar",
        "name": "bar",
        "private": undefined,
        "provider": "@reelout/npm",
        "root": false,
        "version": "1.0.0",
      },
      {
        "dependencies": [
          "bar",
        ],
        "entry": false,
        "files": "packages/foo/**/*",
        "location": "packages/foo",
        "name": "foo",
        "private": undefined,
        "provider": "@reelout/npm",
        "root": false,
        "version": "1.0.0",
      },
      {
        "dependencies": [
          "foo",
        ],
        "entry": true,
        "files": "!{package-lock.json,npm-shrinkwrap.json,pnpm-lock.yaml,yarn.lock,packages/*/**/*}",
        "location": ".",
        "name": undefined,
        "private": undefined,
        "provider": "@reelout/npm",
        "root": true,
        "version": "0.0.0",
      },
      {
        "dependencies": [],
        "entry": false,
        "location": "docs",
        "provider": undefined,
      },
    ]
  `)
  expect(logger.mock.calls).toMatchInlineSnapshot(`
    [
      [
        "[33mPackage could not be loaded: Package version "null" in "packages/baz" is not a valid semantic version.[39m",
      ],
      [
        "[33mPackage could not be loaded: JSON file at "[1m/repo/packages/qux/package.json[22m" could not be parsed.[39m",
      ],
      [
        "Status: [32mSUCCESS[39m",
      ],
      [
        "Release complete: [33mNo packages are scheduled for release.[39m",
      ],
    ]
  `)
})

test('filters discovered packages against the context filter patterns', async () => {
  workspace.entry = '.'
  workspace.members = ['packages/*']

  vol.fromJSON({
    '/repo/packages/foo/package.json': JSON.stringify({
      name: 'foo',
      version: '1.0.0',
      dependencies: {},
    }),
    '/repo/packages/bar/package.json': JSON.stringify({
      name: 'bar',
      version: '1.0.0',
      dependencies: {},
    }),
    '/repo/pnpm-workspace.yaml': 'packages:\n  - packages/*',
    '/repo/package.json': JSON.stringify({
      version: '0.0.0',
      dependencies: {},
    }),
  })

  context.filter = ['bar']

  await executeReleaseWorkflow(context, [plugin()])

  expect(context.packages.map((pkg) => pkg.name)).toEqual(['bar'])
})

test('keeps every named non-excluded package for negation-only filters', async () => {
  workspace.entry = '.'
  workspace.members = ['packages/*']

  vol.fromJSON({
    '/repo/packages/foo/package.json': JSON.stringify({
      name: 'foo',
      version: '1.0.0',
      dependencies: {},
    }),
    '/repo/packages/bar/package.json': JSON.stringify({
      name: 'bar',
      version: '1.0.0',
      dependencies: {},
    }),
    '/repo/pnpm-workspace.yaml': 'packages:\n  - packages/*',
    '/repo/package.json': JSON.stringify({
      version: '0.0.0',
      dependencies: {},
    }),
  })

  context.filter = ['!foo']

  await executeReleaseWorkflow(context, [plugin()])

  expect(context.packages.map((pkg) => pkg.name)).toEqual(['bar'])
})

test('updates dependency versions in package manifests when release plans are present', async () => {
  const cwd = '/repo'
  workspace.entry = '.'
  workspace.members = ['*']

  vol.fromJSON({
    '/repo/a/package.json': JSON.stringify({
      name: 'a',
      version: '1.0.0',
      dependencies: {
        x: '^9.0.0',
      },
      devDependencies: {
        b: '^2.0.0',
        c: '^3.0.0',
        y: '^9.0.0',
      },
      peerDependencies: {
        b: '^2.0.0',
        c: 'workspace:^',
      },
    }),
    '/repo/b/package.json': JSON.stringify({
      name: 'b',
      version: '2.0.0',
    }),
    '/repo/c/package.json': JSON.stringify({
      name: 'c',
      version: '3.0.0',
    }),
  })

  context.plans = [
    {
      package: {
        ...(await buildPackage({
          rootDir: cwd,
          packageDir: 'a',
          workspace,
          packageManager: 'npm',
        })),
        provider: PLUGIN_NAME,
      },
      history: [],
      release: null,
    },
    {
      package: {
        ...(await buildPackage({
          rootDir: cwd,
          packageDir: 'b',
          workspace,
          packageManager: 'npm',
        })),
        provider: PLUGIN_NAME,
      },
      history: [],
      release: { type: 'patch', version: '2.0.1' },
    },
    {
      package: {
        ...(await buildPackage({
          rootDir: cwd,
          packageDir: 'c',
          workspace,
          packageManager: 'npm',
        })),
        provider: PLUGIN_NAME,
      },
      history: [],
      release: { type: 'minor', version: '3.1.0' },
    },
  ]

  await executeReleaseWorkflow(context, [plugin()])

  expect(vol.toJSON()).toMatchInlineSnapshot(`
    {
      "/repo/a/package.json": "{
      "name": "a",
      "version": "1.0.0",
      "dependencies": {
        "x": "^9.0.0"
      },
      "devDependencies": {
        "b": "^2.0.1",
        "c": "^3.1.0",
        "y": "^9.0.0"
      },
      "peerDependencies": {
        "b": "^2.0.1",
        "c": "workspace:^"
      }
    }
    ",
      "/repo/b/package.json": "{
      "name": "b",
      "version": "2.0.1"
    }
    ",
      "/repo/c/package.json": "{
      "name": "c",
      "version": "3.1.0"
    }
    ",
    }
  `)
})

test('does not modify package manifests when dry-run mode is enabled', async () => {
  await provideAmbientAuth()

  using _dryRun = vi.spyOn(context, 'dryRun', 'get').mockReturnValue(true)

  vol.fromJSON({
    '/repo/a/package.json': JSON.stringify({ name: 'a', version: '0.0.0' }),
    '/repo/b/package.json': JSON.stringify({ name: 'b', version: '0.0.0' }),
  })

  context.plans = [
    {
      package: { location: 'a', version: '1.2.2' },
      history: [] as GitCommit[],
      release: { version: '1.2.3' },
    },
    {
      package: { location: 'b' },
      history: [] as GitCommit[],
      release: null,
    },
  ] as ReleasePlan[]

  await executeReleaseWorkflow(context, [plugin()])

  expect(vol.toJSON()).toEqual({
    '/repo/a/package.json': JSON.stringify({ name: 'a', version: '0.0.0' }),
    '/repo/b/package.json': JSON.stringify({ name: 'b', version: '0.0.0' }),
  })
  expect(logger.mock.calls).toMatchInlineSnapshot(`
    [
      [
        "[33mPackage could not be loaded: JSON file at "[1m/repo/package.json[22m" could not be read.[39m",
      ],
      [
        "Status: [32mSUCCESS[39m [33m(dry run)[39m",
      ],
      [
        "Release complete: [1m[32m1 released[39m[22m [90m(0)[39m

    [90m ./a [39m[42m 1.2.3 ← 1.2.2 [49m
    ",
      ],
    ]
  `)
})

test('does not modify package manifests when owned by another provider', async () => {
  vol.fromJSON({
    '/repo/a/package.json': JSON.stringify({
      name: 'a',
      version: '1.0.0',
      devDependencies: { b: '^1.0.0' },
    }),
    '/repo/b/package.json': JSON.stringify({
      name: 'b',
      version: '1.0.0',
    }),
  })

  context.plans = [
    {
      package: {
        provider: PLUGIN_NAME,
        location: 'a',
        version: '1.0.0',
        private: false,
      },
      history: [] as GitCommit[],
      release: { type: 'patch', version: '1.0.1' },
    },
    {
      package: {
        provider: '@reelout/cargo',
        location: 'b',
        version: '1.0.0',
        private: false,
      },
      history: [] as GitCommit[],
      release: { type: 'patch', version: '1.0.1' },
    },
  ] as ReleasePlan[]

  await executeReleaseWorkflow(context, [plugin()])

  expect(vol.toJSON()).toMatchInlineSnapshot(`
    {
      "/repo/a/package.json": "{"name":"a","version":"1.0.0","devDependencies":{"b":"^1.0.0"}}",
      "/repo/b/package.json": "{"name":"b","version":"1.0.0"}",
    }
  `)
})

test('does not publish packages when owned by another provider', async () => {
  await provideAmbientAuth()

  vol.fromJSON({
    '/repo/a/package.json': JSON.stringify({ name: 'a', version: '0.0.0' }),
    '/repo/b/package.json': JSON.stringify({ name: 'b', version: '0.0.0' }),
  })

  context.plans = [
    {
      package: {
        provider: PLUGIN_NAME,
        location: 'a',
        version: '1.0.0',
        private: false,
      },
      history: [] as GitCommit[],
      release: { type: 'patch', version: '1.0.1' },
    },
    {
      package: {
        provider: '@reelout/cargo',
        location: 'b',
        version: '1.0.0',
        private: false,
      },
      history: [] as GitCommit[],
      release: { type: 'patch', version: '1.0.1' },
    },
  ] as ReleasePlan[]

  await executeReleaseWorkflow(context, [plugin()])

  expect(publishPackage).toHaveBeenCalledTimes(1)
  expect(publishPackage.mock.calls).toMatchInlineSnapshot(`
    [
      [
        "/repo",
        {
          "history": [],
          "package": {
            "location": "a",
            "private": false,
            "provider": "@reelout/npm",
            "version": "1.0.0",
          },
          "release": {
            "type": "patch",
            "version": "1.0.1",
          },
        },
        {
          "access": undefined,
          "dryRun": false,
          "provenance": undefined,
          "stage": undefined,
          "tag": undefined,
        },
      ],
    ]
  `)
})

test('skips authentication and publishing when packages are private', async () => {
  await provideAmbientAuth()

  prepareAuth.mockRejectedValue(new Error('Auth token is missing.'))

  vol.fromJSON({
    '/repo/a/package.json': JSON.stringify({ name: 'a', version: '0.0.0' }),
    '/repo/b/package.json': JSON.stringify({ name: 'b', version: '0.0.0' }),
  })

  context.plans = [
    {
      package: { location: 'a', version: '1.2.2', private: true },
      history: [] as GitCommit[],
      release: { version: '1.2.3' },
    },
    {
      package: { location: 'b', version: '2.0.0-rc', private: true },
      history: [] as GitCommit[],
      release: { version: '2.0.0' },
    },
  ] as ReleasePlan[]

  await executeReleaseWorkflow(context, [plugin()])

  expect(prepareAuth).toHaveBeenCalledTimes(0)
  expect(publishPackage).toHaveBeenCalledTimes(0)
  expect(logger.mock.calls).toMatchInlineSnapshot(`
    [
      [
        "[33mPackage could not be loaded: JSON file at "[1m/repo/package.json[22m" could not be read.[39m",
      ],
      [
        "Status: [32mSUCCESS[39m",
      ],
      [
        "Release complete: [1m[32m2 released[39m[22m [90m(0)[39m

    [90m ./a [39m[42m 1.2.3 ← 1.2.2 [49m

    [90m ./b [39m[42m 2.0.0 ← 2.0.0-rc [49m
    ",
      ],
    ]
  `)
})

test('forwards dryRun flag to publisher when dry-run mode is enabled', async () => {
  await provideAmbientAuth()

  using _dryRun = vi.spyOn(context, 'dryRun', 'get').mockReturnValue(true)

  vol.fromJSON({
    '/repo/a/package.json': JSON.stringify({ name: 'a', version: '0.0.0' }),
    '/repo/b/package.json': JSON.stringify({ name: 'b', version: '0.0.0' }),
  })

  context.plans = [
    {
      package: { provider: PLUGIN_NAME, location: 'a', version: '1.2.2' },
      history: [] as GitCommit[],
      release: { version: '1.2.3' },
    },
    {
      package: { provider: PLUGIN_NAME, location: 'b', version: '1.2.3' },
      history: [] as GitCommit[],
      release: { version: '2.0.0' },
    },
  ] as ReleasePlan[]

  await executeReleaseWorkflow(context, [plugin()])

  expect(prepareAuth).toHaveBeenCalledTimes(2)
  expect(publishPackage.mock.calls).toMatchInlineSnapshot(`
    [
      [
        "/repo",
        {
          "history": [],
          "package": {
            "location": "a",
            "provider": "@reelout/npm",
            "version": "1.2.2",
          },
          "release": {
            "version": "1.2.3",
          },
        },
        {
          "access": undefined,
          "dryRun": true,
          "provenance": undefined,
          "stage": undefined,
          "tag": undefined,
        },
      ],
      [
        "/repo",
        {
          "history": [],
          "package": {
            "location": "b",
            "provider": "@reelout/npm",
            "version": "1.2.3",
          },
          "release": {
            "version": "2.0.0",
          },
        },
        {
          "access": undefined,
          "dryRun": true,
          "provenance": undefined,
          "stage": undefined,
          "tag": undefined,
        },
      ],
    ]
  `)
  expect(logger.mock.calls).toMatchInlineSnapshot(`
    [
      [
        "[33mPackage could not be loaded: JSON file at "[1m/repo/package.json[22m" could not be read.[39m",
      ],
      [
        "Status: [32mSUCCESS[39m [33m(dry run)[39m",
      ],
      [
        "Release complete: [1m[32m2 released[39m[22m [90m(0)[39m

    [90m ./a [39m[42m 1.2.3 ← 1.2.2 [49m

    [90m ./b [39m[42m 2.0.0 ← 1.2.3 [49m
    ",
      ],
    ]
  `)
})

test('forwards access, provenance, and stage options to publisher when explicitly configured', async () => {
  await provideAmbientAuth()

  using _ = vi.spyOn(context, 'releaseChannel', 'get').mockReturnValue('beta')

  vol.fromJSON({
    '/repo/a/package.json': JSON.stringify({ name: 'a', version: '0.0.0' }),
    '/repo/b/package.json': JSON.stringify({ name: 'b', version: '0.0.0' }),
  })

  context.plans = [
    {
      package: { provider: PLUGIN_NAME, location: 'a' },
      history: [] as GitCommit[],
      release: { version: '1.2.3' },
    },
    {
      package: { provider: PLUGIN_NAME, location: 'b' },
      history: [] as GitCommit[],
      release: { version: '2.0.0' },
    },
  ] as ReleasePlan[]

  await executeReleaseWorkflow(context, [
    plugin({ access: 'restricted', provenance: true, stage: false }),
  ])

  expect(prepareAuth.mock.calls).toMatchInlineSnapshot(`
    [
      [
        {
          "cwd": "/repo",
        },
      ],
      [
        {
          "cwd": "/repo",
        },
      ],
    ]
  `)
  expect(publishPackage.mock.calls).toMatchInlineSnapshot(`
    [
      [
        "/repo",
        {
          "history": [],
          "package": {
            "location": "a",
            "provider": "@reelout/npm",
          },
          "release": {
            "version": "1.2.3",
          },
        },
        {
          "access": "restricted",
          "dryRun": false,
          "provenance": true,
          "stage": false,
          "tag": "beta",
        },
      ],
      [
        "/repo",
        {
          "history": [],
          "package": {
            "location": "b",
            "provider": "@reelout/npm",
          },
          "release": {
            "version": "2.0.0",
          },
        },
        {
          "access": "restricted",
          "dryRun": false,
          "provenance": true,
          "stage": false,
          "tag": "beta",
        },
      ],
    ]
  `)
})

test('enables provenance automatically when publishing to a public GitHub repository', async () => {
  await provideAmbientAuth()

  context.env = {
    'GITHUB_TOKEN': 'mock-github-token',
  }

  isGitHubRepositoryPublic.mockResolvedValueOnce(true)

  context.repository = repository

  vol.fromJSON({
    '/repo/package.json': JSON.stringify({
      name: 'root',
      repository: {
        type: 'git',
        url: 'https://github.com/mock-owner/mock-repo.git',
      },
    }),
    '/repo/a/package.json': JSON.stringify({ name: 'a', version: '0.0.0' }),
  })

  context.plans = [
    {
      package: { provider: PLUGIN_NAME, location: 'a' },
      history: [] as GitCommit[],
      release: { version: '1.2.3' },
    },
  ] as ReleasePlan[]

  await executeReleaseWorkflow(context, [plugin()])

  expect(isGitHubRepositoryPublic).toHaveBeenCalledWith(
    'mock-github-token',
    context.repository
  )
  expect(publishPackage.mock.calls).toMatchInlineSnapshot(`
    [
      [
        "/repo",
        {
          "history": [],
          "package": {
            "location": "a",
            "provider": "@reelout/npm",
          },
          "release": {
            "version": "1.2.3",
          },
        },
        {
          "access": undefined,
          "dryRun": false,
          "provenance": true,
          "stage": undefined,
          "tag": undefined,
        },
      ],
    ]
  `)
})

test('enables provenance automatically when publishing to a public GitLab repository', async () => {
  await provideAmbientAuth()

  context.env = {
    'GITLAB_TOKEN': 'mock-gitlab-token',
  }

  isGitLabRepositoryPublic.mockResolvedValueOnce(true)

  context.repository = createMockRepository('gitlab')

  vol.fromJSON({
    '/repo/package.json': JSON.stringify({
      name: 'root',
      repository: {
        type: 'git',
        url: 'https://gitlab.com/mock-owner/mock-repo.git',
      },
    }),
    '/repo/a/package.json': JSON.stringify({ name: 'a', version: '0.0.0' }),
  })

  context.plans = [
    {
      package: { provider: PLUGIN_NAME, location: 'a' },
      history: [] as GitCommit[],
      release: { version: '1.2.3' },
    },
  ] as ReleasePlan[]

  await executeReleaseWorkflow(context, [plugin()])

  expect(isGitLabRepositoryPublic).toHaveBeenCalledWith(
    'mock-gitlab-token',
    context.repository
  )
  expect(publishPackage.mock.calls).toMatchInlineSnapshot(`
    [
      [
        "/repo",
        {
          "history": [],
          "package": {
            "location": "a",
            "provider": "@reelout/npm",
          },
          "release": {
            "version": "1.2.3",
          },
        },
        {
          "access": undefined,
          "dryRun": false,
          "provenance": true,
          "stage": undefined,
          "tag": undefined,
        },
      ],
    ]
  `)
})

test('leaves provenance undefined when repository visibility check fails', async () => {
  await provideAmbientAuth()

  context.env = {
    'GITHUB_TOKEN': 'mock-github-token',
  }

  isGitHubRepositoryPublic.mockRejectedValueOnce(new Error('API error'))

  context.repository = repository

  vol.fromJSON({
    '/repo/package.json': JSON.stringify({
      name: 'root',
      repository: {
        type: 'git',
        url: 'https://github.com/mock-owner/mock-repo.git',
      },
    }),
    '/repo/a/package.json': JSON.stringify({ name: 'a', version: '0.0.0' }),
  })

  context.plans = [
    {
      package: { provider: PLUGIN_NAME, location: 'a' },
      history: [] as GitCommit[],
      release: { version: '1.2.3' },
    },
  ] as ReleasePlan[]

  await executeReleaseWorkflow(context, [plugin()])

  expect(isGitHubRepositoryPublic).toHaveBeenCalledWith(
    'mock-github-token',
    context.repository
  )
  expect(publishPackage.mock.calls).toMatchInlineSnapshot(`
    [
      [
        "/repo",
        {
          "history": [],
          "package": {
            "location": "a",
            "provider": "@reelout/npm",
          },
          "release": {
            "version": "1.2.3",
          },
        },
        {
          "access": undefined,
          "dryRun": false,
          "provenance": undefined,
          "stage": undefined,
          "tag": undefined,
        },
      ],
    ]
  `)
})

test('leaves provenance undefined when repository host is unsupported', async () => {
  await provideAmbientAuth()

  context.env = {
    'GITHUB_TOKEN': 'mock-github-token',
    'GITLAB_TOKEN': 'mock-gitlab-token',
  }

  context.repository = createMockRepository('bitbucket')

  vol.fromJSON({
    '/repo/package.json': JSON.stringify({
      name: 'root',
      repository: {
        type: 'git',
        url: 'https://bitbucket.org/mock-owner/mock-repo.git',
      },
    }),
    '/repo/a/package.json': JSON.stringify({ name: 'a', version: '0.0.0' }),
  })

  context.plans = [
    {
      package: { provider: PLUGIN_NAME, location: 'a' },
      history: [] as GitCommit[],
      release: { version: '1.2.3' },
    },
  ] as ReleasePlan[]

  await executeReleaseWorkflow(context, [plugin()])

  expect(isGitHubRepositoryPublic).not.toHaveBeenCalled()
  expect(isGitLabRepositoryPublic).not.toHaveBeenCalled()
  expect(publishPackage.mock.calls).toMatchInlineSnapshot(`
    [
      [
        "/repo",
        {
          "history": [],
          "package": {
            "location": "a",
            "provider": "@reelout/npm",
          },
          "release": {
            "version": "1.2.3",
          },
        },
        {
          "access": undefined,
          "dryRun": false,
          "provenance": undefined,
          "stage": undefined,
          "tag": undefined,
        },
      ],
    ]
  `)
})

test('leaves provenance undefined when repository host tokens are missing', async () => {
  await provideAmbientAuth()

  context.env = {
    'GITHUB_TOKEN': undefined,
    'GITLAB_TOKEN': undefined,
  }

  context.repository = repository

  vol.fromJSON({
    '/repo/package.json': JSON.stringify({
      name: 'root',
      repository: {
        type: 'git',
        url: 'https://github.com/mock-owner/mock-repo.git',
      },
    }),
    '/repo/a/package.json': JSON.stringify({ name: 'a', version: '0.0.0' }),
  })

  context.plans = [
    {
      package: { provider: PLUGIN_NAME, location: 'a' },
      history: [] as GitCommit[],
      release: { version: '1.2.3' },
    },
  ] as ReleasePlan[]

  await executeReleaseWorkflow(context, [plugin()])

  expect(isGitHubRepositoryPublic).not.toHaveBeenCalled()
  expect(isGitLabRepositoryPublic).not.toHaveBeenCalled()
  expect(publishPackage.mock.calls).toMatchInlineSnapshot(`
    [
      [
        "/repo",
        {
          "history": [],
          "package": {
            "location": "a",
            "provider": "@reelout/npm",
          },
          "release": {
            "version": "1.2.3",
          },
        },
        {
          "access": undefined,
          "dryRun": false,
          "provenance": undefined,
          "stage": undefined,
          "tag": undefined,
        },
      ],
    ]
  `)
})

test('leaves provenance undefined when the package manifest does not define a repository', async () => {
  await provideAmbientAuth()

  context.env = {
    'GITHUB_TOKEN': 'mock-github-token',
  }

  isGitHubRepositoryPublic.mockResolvedValueOnce(true)

  context.repository = repository

  vol.fromJSON({
    '/repo/package.json': JSON.stringify({ name: 'root' }),
    '/repo/a/package.json': JSON.stringify({ name: 'a', version: '0.0.0' }),
  })

  context.plans = [
    {
      package: { provider: PLUGIN_NAME, location: 'a' },
      history: [] as GitCommit[],
      release: { version: '1.2.3' },
    },
  ] as ReleasePlan[]

  await executeReleaseWorkflow(context, [plugin()])

  expect(isGitHubRepositoryPublic).not.toHaveBeenCalled()
  expect(publishPackage.mock.calls).toMatchInlineSnapshot(`
    [
      [
        "/repo",
        {
          "history": [],
          "package": {
            "location": "a",
            "provider": "@reelout/npm",
          },
          "release": {
            "version": "1.2.3",
          },
        },
        {
          "access": undefined,
          "dryRun": false,
          "provenance": undefined,
          "stage": undefined,
          "tag": undefined,
        },
      ],
    ]
  `)
})

test('leaves provenance undefined when the context repository no longer matches the manifest repository', async () => {
  await provideAmbientAuth()

  context.env = {
    'GITHUB_TOKEN': 'mock-github-token',
  }

  isGitHubRepositoryPublic.mockResolvedValueOnce(true)

  context.repository = repository

  const mutator: ReleasePlugin = {
    name: 'mutator',
    version: '0.0.0',
    write: async (mutatedContext, next) => {
      mutatedContext.repository = createMockRepository('gitlab')
      return next(mutatedContext)
    },
  }

  vol.fromJSON({
    '/repo/package.json': JSON.stringify({
      name: 'root',
      repository: {
        type: 'git',
        url: 'https://github.com/mock-owner/mock-repo.git',
      },
    }),
    '/repo/a/package.json': JSON.stringify({ name: 'a', version: '0.0.0' }),
  })

  context.plans = [
    {
      package: { provider: PLUGIN_NAME, location: 'a' },
      history: [] as GitCommit[],
      release: { version: '1.2.3' },
    },
  ] as ReleasePlan[]

  await executeReleaseWorkflow(context, [plugin(), mutator])

  expect(isGitHubRepositoryPublic).not.toHaveBeenCalled()
  expect(publishPackage.mock.calls).toMatchInlineSnapshot(`
    [
      [
        "/repo",
        {
          "history": [],
          "package": {
            "location": "a",
            "provider": "@reelout/npm",
          },
          "release": {
            "version": "1.2.3",
          },
        },
        {
          "access": undefined,
          "dryRun": false,
          "provenance": undefined,
          "stage": undefined,
          "tag": undefined,
        },
      ],
    ]
  `)
})

test('rejects workflow execution when auth token setup fails', async () => {
  await provideAmbientAuth()

  prepareAuth.mockRejectedValue(new Error('Auth token is missing.'))

  vol.fromJSON({
    '/repo/a/package.json': JSON.stringify({ name: 'a', version: '0.0.0' }),
    '/repo/b/package.json': JSON.stringify({ name: 'b', version: '0.0.0' }),
  })

  context.plans = [
    {
      package: { provider: PLUGIN_NAME, location: 'a' },
      history: [] as GitCommit[],
      release: { version: '1.2.3' },
    },
    {
      package: { provider: PLUGIN_NAME, location: 'b' },
      history: [] as GitCommit[],
      release: { version: '2.0.0' },
    },
  ] as ReleasePlan[]

  await expect(
    executeReleaseWorkflow(context, [plugin()])
  ).rejects.toMatchInlineSnapshot(`[Error: Auth token is missing.]`)

  expect(prepareAuth).toHaveBeenCalledTimes(1)
  expect(publishPackage).toHaveBeenCalledTimes(1)
  expect(logger.mock.calls).toMatchInlineSnapshot(`
    [
      [
        "[33mPackage could not be loaded: JSON file at "[1m/repo/package.json[22m" could not be read.[39m",
      ],
      [
        "Status: [31mFAILURE[39m",
      ],
      [
        "Release complete: [31mAuth token is missing.[39m",
      ],
    ]
  `)
})

test('skips publishing when registry authentication is unavailable', async () => {
  vol.fromJSON({
    '/repo/a/package.json': JSON.stringify({ name: 'a', version: '0.0.0' }),
    '/repo/b/package.json': JSON.stringify({ name: 'b', version: '0.0.0' }),
  })

  context.plans = [
    {
      package: { provider: PLUGIN_NAME, location: 'a' },
      history: [] as GitCommit[],
      release: { version: '1.2.3' },
    },
    {
      package: { provider: PLUGIN_NAME, location: 'b' },
      history: [] as GitCommit[],
      release: { version: '2.0.0' },
    },
  ] as ReleasePlan[]

  await executeReleaseWorkflow(context, [plugin()])

  expect(publishPackage).toHaveBeenCalledTimes(0)
  expect(execCommand).toHaveBeenCalledTimes(0)
  expect(
    logger.mock.calls.filter(
      ([message]) =>
        typeof message === 'string' &&
        message.includes(
          'Packages will not be published: NPM_TOKEN is required for NPM authentication.'
        )
    )
  ).toHaveLength(1)
  expect(context.outcome?.status).toBe('success')
})

test('fails fast before publishing when registry authentication is unavailable in strict mode', async () => {
  context.strict = true

  vol.fromJSON({
    '/repo/a/package.json': JSON.stringify({ name: 'a', version: '0.0.0' }),
  })

  context.plans = [
    {
      package: { provider: PLUGIN_NAME, location: 'a' },
      history: [] as GitCommit[],
      release: { version: '1.2.3' },
    },
  ] as ReleasePlan[]

  await expect(executeReleaseWorkflow(context, [plugin()])).rejects.toThrow(
    'NPM_TOKEN is required for NPM authentication in strict mode.'
  )

  expect(vol.toJSON()).toEqual({
    '/repo/a/package.json': JSON.stringify({ name: 'a', version: '0.0.0' }),
  })
  expect(publishPackage).toHaveBeenCalledTimes(0)
  expect(execCommand).toHaveBeenCalledTimes(0)
})

test('rejects workflow execution when registry authentication verification fails', async () => {
  context.env = { NPM_TOKEN: 'mock-expired-token' }

  execCommand.mockRejectedValueOnce(
    new Error('401 Unauthorized: invalid auth token')
  )

  vol.fromJSON({
    '/repo/a/package.json': JSON.stringify({ name: 'a', version: '0.0.0' }),
  })

  context.plans = [
    {
      package: { provider: PLUGIN_NAME, location: 'a' },
      history: [] as GitCommit[],
      release: { version: '1.2.3' },
    },
  ] as ReleasePlan[]

  await expect(executeReleaseWorkflow(context, [plugin()])).rejects.toThrow(
    'NPM_TOKEN or ambient registry credentials are invalid or expired.'
  )

  expect(execCommand).toHaveBeenCalledTimes(1)
  expect(publishPackage).toHaveBeenCalledTimes(0)
})

test('verifies NPM_TOKEN with a whoami pre-flight before publishing', async () => {
  context.env = { NPM_TOKEN: 'mock-npm-token' }

  vol.fromJSON({
    '/repo/a/package.json': JSON.stringify({ name: 'a', version: '0.0.0' }),
  })

  context.plans = [
    {
      package: { provider: PLUGIN_NAME, location: 'a' },
      history: [] as GitCommit[],
      release: { version: '1.2.3' },
    },
  ] as ReleasePlan[]

  await executeReleaseWorkflow(context, [plugin()])

  expect(execCommand.mock.calls).toEqual([
    [
      'npm',
      ['whoami', '--registry', 'https://registry.npmjs.org/'],
      {
        cwd: '/repo',
        env: {
          NPM_TOKEN: 'mock-npm-token',
          'npm_config_//registry.npmjs.org/:_authToken': 'mock-npm-token',
        },
      },
    ],
  ])
  expect(publishPackage).toHaveBeenCalledTimes(1)
})

test('verifies ambient registry credentials with a whoami pre-flight before publishing', async () => {
  await provideAmbientAuth()

  vol.fromJSON({
    '/repo/a/package.json': JSON.stringify({ name: 'a', version: '0.0.0' }),
  })

  context.plans = [
    {
      package: { provider: PLUGIN_NAME, location: 'a' },
      history: [] as GitCommit[],
      release: { version: '1.2.3' },
    },
  ] as ReleasePlan[]

  await executeReleaseWorkflow(context, [plugin()])

  expect(execCommand.mock.calls).toEqual([
    [
      'npm',
      ['whoami', '--registry', 'https://registry.npmjs.org/'],
      { cwd: '/repo', env: {} },
    ],
  ])
  expect(publishPackage).toHaveBeenCalledTimes(1)
})

test('rejects workflow execution when ambient registry credentials fail verification', async () => {
  await provideAmbientAuth()

  execCommand.mockRejectedValueOnce(
    new Error('401 Unauthorized: invalid auth token')
  )

  vol.fromJSON({
    '/repo/a/package.json': JSON.stringify({ name: 'a', version: '0.0.0' }),
  })

  context.plans = [
    {
      package: { provider: PLUGIN_NAME, location: 'a' },
      history: [] as GitCommit[],
      release: { version: '1.2.3' },
    },
  ] as ReleasePlan[]

  await expect(executeReleaseWorkflow(context, [plugin()])).rejects.toThrow(
    'NPM_TOKEN or ambient registry credentials are invalid or expired.'
  )

  expect(publishPackage).toHaveBeenCalledTimes(0)
})

test('publishes without a whoami pre-flight when NPM_ID_TOKEN is available', async () => {
  context.env = { NPM_ID_TOKEN: 'mock-id-token' }

  vol.fromJSON({
    '/repo/a/package.json': JSON.stringify({ name: 'a', version: '0.0.0' }),
  })

  context.plans = [
    {
      package: { provider: PLUGIN_NAME, location: 'a' },
      history: [] as GitCommit[],
      release: { version: '1.2.3' },
    },
  ] as ReleasePlan[]

  await executeReleaseWorkflow(context, [plugin()])

  expect(execCommand).toHaveBeenCalledTimes(0)
  expect(publishPackage).toHaveBeenCalledTimes(1)
})

test('verifies trusted publishing before probing publishable plans', async () => {
  provideOIDCAuth()

  mountPackageFixture()

  context.plans = [
    createCompleteReleasePlan(),
    createReleasePlan({ name: 'b', location: 'b', releaseVersion: '2.0.0' }),
  ]

  await executeReleaseWorkflow(context, [plugin()])

  expect(verifyTrustedPublishing).toHaveBeenCalledTimes(1)

  expect(verifyTrustedPublishing).toHaveBeenCalledBefore(execCommand)

  expect(verifyTrustedPublishing).toHaveBeenCalledWith(
    context,
    context.plans,
    expect.objectContaining({ name: 'npm', isNpm: true })
  )
})

test('verifies trusted publishing in dry-run mode', async () => {
  using _dryRun = vi.spyOn(context, 'dryRun', 'get').mockReturnValue(true)

  provideOIDCAuth()

  mountPackageFixture()

  context.plans = [createCompleteReleasePlan()]

  await executeReleaseWorkflow(context, [plugin()])

  expect(verifyTrustedPublishing).toHaveBeenCalledTimes(1)
})

test('previews the authentication skip identically in dry-run mode', async () => {
  using _dryRun = vi.spyOn(context, 'dryRun', 'get').mockReturnValue(true)

  vol.fromJSON({
    '/repo/a/package.json': JSON.stringify({ name: 'a', version: '0.0.0' }),
  })

  context.plans = [
    {
      package: { provider: PLUGIN_NAME, location: 'a' },
      history: [] as GitCommit[],
      release: { version: '1.2.3' },
    },
  ] as ReleasePlan[]

  await executeReleaseWorkflow(context, [plugin()])

  expect(publishPackage).toHaveBeenCalledTimes(0)
  expect(execCommand).toHaveBeenCalledTimes(0)
  expect(
    logger.mock.calls.filter(
      ([message]) =>
        typeof message === 'string' &&
        message.includes(
          'Packages will not be published: NPM_TOKEN is required for NPM authentication.'
        )
    )
  ).toHaveLength(1)
})

test('publishes without a whoami pre-flight when GitHub Actions OIDC tokens are available', async () => {
  context.env = {
    ACTIONS_ID_TOKEN_REQUEST_URL: 'https://mock.url',
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'mock-request-token',
  }

  vol.fromJSON({
    '/repo/a/package.json': JSON.stringify({ name: 'a', version: '0.0.0' }),
  })

  context.plans = [
    {
      package: { provider: PLUGIN_NAME, location: 'a' },
      history: [] as GitCommit[],
      release: { version: '1.2.3' },
    },
  ] as ReleasePlan[]

  await executeReleaseWorkflow(context, [plugin()])

  expect(execCommand).toHaveBeenCalledTimes(0)
  expect(publishPackage).toHaveBeenCalledTimes(1)
})

test('probes each complete release plan before publishing when the version is absent', async () => {
  provideOIDCAuth()

  mountPackageFixture()

  context.plans = [
    createCompleteReleasePlan(),
    createReleasePlan({ name: 'b', location: 'b', releaseVersion: '2.0.0' }),
  ]

  await executeReleaseWorkflow(context, [plugin()])

  expect(execCommand.mock.calls).toEqual([
    [
      'npm',
      ['view', 'a@1.2.3', '--json', '--registry', NPMJS],
      {
        cwd: '/repo/a',
        env: { NPM_ID_TOKEN: 'mock-id-token' },
        signal: undefined,
      },
    ],
    [
      'npm',
      ['view', 'b@2.0.0', '--json', '--registry', NPMJS],
      {
        cwd: '/repo/b',
        env: { NPM_ID_TOKEN: 'mock-id-token' },
        signal: undefined,
      },
    ],
  ])
  expect(publishPackage).toHaveBeenCalledTimes(2)
  expect(context.outcome?.status).toBe('success')
})

test('skips the publish and syncs the dist-tag when the registry already has an identical version', async () => {
  provideOIDCAuth()

  context.releaseChannel = 'next'

  mountPackageFixture()

  context.plans = [createCompleteReleasePlan()]

  execCommand.mockImplementationOnce(async () => publishedManifest())

  downloadTarball.mockResolvedValue(Buffer.from('published-tarball'))

  isIdentical.mockReturnValue(true)

  await executeReleaseWorkflow(context, [plugin()])

  expect(execCommand.mock.calls).toEqual([
    [
      'npm',
      ['view', 'a@1.2.3', '--json', '--registry', NPMJS],
      {
        cwd: '/repo/a',
        env: { NPM_ID_TOKEN: 'mock-id-token' },
        signal: undefined,
      },
    ],
    [
      'npm',
      ['pack', '--pack-destination', expect.any(String)],
      {
        cwd: '/repo/a',
        env: { NPM_ID_TOKEN: 'mock-id-token' },
        signal: undefined,
      },
    ],
    [
      'npm',
      ['dist-tag', 'add', 'a@1.2.3', 'next', '--registry', NPMJS],
      {
        cwd: '/repo/a',
        env: { NPM_ID_TOKEN: 'mock-id-token' },
        signal: undefined,
      },
    ],
  ])
  expect(downloadTarball).toHaveBeenCalledTimes(1)
  expect(publishPackage).toHaveBeenCalledTimes(0)
  expect(
    warnCalls().filter((message) =>
      message.includes('Skipping publish of "a@1.2.3"')
    )
  ).toHaveLength(1)
  expect(context.outcome?.status).toBe('success')
})

test('does not run a dist-tag command when the channel tag already points at the released version', async () => {
  provideOIDCAuth()

  context.releaseChannel = 'next'

  mountPackageFixture()

  context.plans = [createCompleteReleasePlan()]

  execCommand.mockImplementationOnce(async () =>
    publishedManifest({ next: '1.2.3' })
  )

  downloadTarball.mockResolvedValue(Buffer.from('published-tarball'))

  isIdentical.mockReturnValue(true)

  await executeReleaseWorkflow(context, [plugin()])

  expect(execCommand.mock.calls).toEqual([
    [
      'npm',
      ['view', 'a@1.2.3', '--json', '--registry', NPMJS],
      expect.anything(),
    ],
    [
      'npm',
      ['pack', '--pack-destination', expect.any(String)],
      expect.anything(),
    ],
  ])
  expect(publishPackage).toHaveBeenCalledTimes(0)
})

test('syncs the default latest dist-tag when no release channel is set', async () => {
  provideOIDCAuth()

  mountPackageFixture()

  context.plans = [createCompleteReleasePlan()]

  execCommand.mockImplementationOnce(async () => publishedManifest())

  downloadTarball.mockResolvedValue(Buffer.from('published-tarball'))

  isIdentical.mockReturnValue(true)

  await executeReleaseWorkflow(context, [plugin()])

  expect(execCommand.mock.calls[2]).toEqual([
    'npm',
    ['dist-tag', 'add', 'a@1.2.3', 'latest', '--registry', NPMJS],
    expect.anything(),
  ])
})

test('skips the publish of an identical version reported as a one-element array', async () => {
  provideOIDCAuth()

  mountPackageFixture()

  context.plans = [createCompleteReleasePlan()]

  execCommand.mockImplementationOnce(async () =>
    JSON.stringify([JSON.parse(publishedManifest())])
  )

  downloadTarball.mockResolvedValue(Buffer.from('published-tarball'))

  isIdentical.mockReturnValue(true)

  await executeReleaseWorkflow(context, [plugin()])

  expect(publishPackage).toHaveBeenCalledTimes(0)
  expect(
    warnCalls().filter((message) =>
      message.includes('Skipping publish of "a@1.2.3"')
    )
  ).toHaveLength(1)
})

test('skips downloading the published tarball when its recorded integrity matches the packed tarball', async () => {
  provideOIDCAuth()

  mountPackageFixture()

  context.plans = [createCompleteReleasePlan()]

  execCommand.mockImplementationOnce(async () =>
    publishedManifest(
      { latest: '1.0.0' },
      `sha512-${createHash('sha512').update('packed-tarball').digest('base64')}`
    )
  )

  await executeReleaseWorkflow(context, [plugin()])

  expect(downloadTarball).toHaveBeenCalledTimes(0)
  expect(isIdentical).toHaveBeenCalledTimes(0)
  expect(publishPackage).toHaveBeenCalledTimes(0)
  expect(
    warnCalls().filter((message) =>
      message.includes('Skipping publish of "a@1.2.3"')
    )
  ).toHaveLength(1)
  expect(context.outcome?.status).toBe('success')
})

test('compares content after download when the recorded integrity does not match the packed tarball', async () => {
  provideOIDCAuth()

  mountPackageFixture()

  context.plans = [createCompleteReleasePlan()]

  execCommand.mockImplementationOnce(async () =>
    publishedManifest(
      { latest: '1.0.0' },
      `sha512-${createHash('sha512').update('other-tarball').digest('base64')}`
    )
  )

  downloadTarball.mockResolvedValue(Buffer.from('published-tarball'))

  isIdentical.mockReturnValue(true)

  await executeReleaseWorkflow(context, [plugin()])

  expect(downloadTarball).toHaveBeenCalledTimes(1)
  expect(isIdentical).toHaveBeenCalledTimes(1)
  expect(publishPackage).toHaveBeenCalledTimes(0)
  expect(
    warnCalls().filter((message) =>
      message.includes('Skipping publish of "a@1.2.3"')
    )
  ).toHaveLength(1)
  expect(context.outcome?.status).toBe('success')
})

test('rejects before any publish when the registry version content cannot be verified as identical', async () => {
  provideOIDCAuth()

  mountPackageFixture()

  context.plans = [
    createCompleteReleasePlan(),
    createReleasePlan({ name: 'b', location: 'b', releaseVersion: '2.0.0' }),
  ]

  execCommand.mockImplementationOnce(async () => publishedManifest())

  downloadTarball.mockResolvedValue(Buffer.from('published-tarball'))

  isIdentical.mockReturnValueOnce(false)

  await expect(executeReleaseWorkflow(context, [plugin()])).rejects.toThrow(
    'Version "a@1.2.3" was not published: the registry already has this version and its content could not be verified as identical.'
  )

  expect(execCommand).toHaveBeenCalledTimes(2)
  expect(publishPackage).toHaveBeenCalledTimes(0)
})

test('rejects before any publish when the published manifest lacks a tarball URL', async () => {
  provideOIDCAuth()

  mountPackageFixture()

  context.plans = [createCompleteReleasePlan()]

  execCommand.mockImplementationOnce(async () =>
    JSON.stringify({
      name: 'a',
      version: '1.2.3',
      'dist-tags': { latest: '1.2.3' },
    })
  )

  await expect(executeReleaseWorkflow(context, [plugin()])).rejects.toThrow(
    'Version "a@1.2.3" was not published: the registry already has this version and its content could not be verified as identical.'
  )

  expect(downloadTarball).toHaveBeenCalledTimes(0)
  expect(publishPackage).toHaveBeenCalledTimes(0)
})

test('rejects before any publish when the published tarball cannot be downloaded', async () => {
  provideOIDCAuth()

  mountPackageFixture()

  context.plans = [createCompleteReleasePlan()]

  execCommand.mockImplementationOnce(async () => publishedManifest())

  downloadTarball.mockRejectedValueOnce(new Error('network unreachable'))

  await expect(executeReleaseWorkflow(context, [plugin()])).rejects.toThrow(
    'Version "a@1.2.3" was not published: the registry already has this version and its content could not be verified as identical.'
  )

  expect(publishPackage).toHaveBeenCalledTimes(0)
})

test('rejects before any publish when the local tarball cannot be packed', async () => {
  provideOIDCAuth()

  mountPackageFixture()

  context.plans = [createCompleteReleasePlan()]

  execCommand
    .mockImplementationOnce(async () => publishedManifest())
    .mockImplementationOnce(async () => {
      throw new Error("Command 'npm pack' failed (exit code 1)")
    })

  downloadTarball.mockResolvedValue(Buffer.from('published-tarball'))

  await expect(executeReleaseWorkflow(context, [plugin()])).rejects.toThrow(
    'Version "a@1.2.3" was not published: the registry already has this version and its content could not be verified as identical.'
  )

  expect(publishPackage).toHaveBeenCalledTimes(0)
})

test('rejects when the probe fails with an authentication error', async () => {
  provideOIDCAuth()

  mountPackageFixture()

  context.plans = [createCompleteReleasePlan()]

  execCommand.mockImplementationOnce(async () => {
    throw new Error(
      "Command 'npm view a@1.2.3 --json' failed (exit code 1)\nnpm error code E401\nnpm error 401 Unauthorized"
    )
  })

  await expect(executeReleaseWorkflow(context, [plugin()])).rejects.toThrow(
    'E401'
  )

  expect(publishPackage).toHaveBeenCalledTimes(0)
})

test('rejects when the probe output cannot be parsed', async () => {
  provideOIDCAuth()

  mountPackageFixture()

  context.plans = [createCompleteReleasePlan()]

  execCommand.mockImplementationOnce(async () => 'not-json')

  await expect(executeReleaseWorkflow(context, [plugin()])).rejects.toThrow(
    'Registry metadata for "a@1.2.3" could not be parsed'
  )

  expect(publishPackage).toHaveBeenCalledTimes(0)
})

test('rejects when the probe output is not a manifest object', async () => {
  provideOIDCAuth()

  mountPackageFixture()

  context.plans = [createCompleteReleasePlan()]

  execCommand.mockImplementationOnce(async () => 'null')

  await expect(executeReleaseWorkflow(context, [plugin()])).rejects.toThrow(
    'Registry metadata for "a@1.2.3" could not be parsed: unexpected metadata format'
  )

  expect(publishPackage).toHaveBeenCalledTimes(0)
})

test('previews identical-version skips in dry-run without publishing or syncing dist-tags', async () => {
  provideOIDCAuth()

  context.dryRun = true
  context.releaseChannel = 'next'

  mountPackageFixture()

  context.plans = [createCompleteReleasePlan()]

  execCommand.mockImplementationOnce(async () => publishedManifest())

  downloadTarball.mockResolvedValue(Buffer.from('published-tarball'))

  isIdentical.mockReturnValue(true)

  await executeReleaseWorkflow(context, [plugin()])

  expect(execCommand.mock.calls).toEqual([
    [
      'npm',
      ['view', 'a@1.2.3', '--json', '--registry', NPMJS],
      expect.anything(),
    ],
    [
      'npm',
      ['pack', '--pack-destination', expect.any(String)],
      expect.anything(),
    ],
  ])
  expect(publishPackage).toHaveBeenCalledTimes(0)
  expect(
    warnCalls().filter((message) =>
      message.includes('Skipping publish of "a@1.2.3"')
    )
  ).toHaveLength(1)
  expect(context.outcome?.status).toBe('success')
})

test('treats a mid-publish publish-over rejection with identical content as published', async () => {
  provideOIDCAuth()

  context.releaseChannel = 'next'

  mountPackageFixture()

  context.plans = [createCompleteReleasePlan()]

  execCommand
    .mockImplementationOnce(async () => {
      throw notFoundError()
    })
    .mockImplementationOnce(async () => publishedManifest({}))

  downloadTarball.mockResolvedValue(Buffer.from('published-tarball'))

  isIdentical.mockReturnValue(true)

  publishPackage.mockRejectedValueOnce(publishOverError())

  await executeReleaseWorkflow(context, [plugin()])

  expect(execCommand.mock.calls).toEqual([
    [
      'npm',
      ['view', 'a@1.2.3', '--json', '--registry', NPMJS],
      expect.anything(),
    ],
    [
      'npm',
      ['view', 'a@1.2.3', '--json', '--registry', NPMJS],
      expect.anything(),
    ],
    [
      'npm',
      ['pack', '--pack-destination', expect.any(String)],
      expect.anything(),
    ],
    [
      'npm',
      ['dist-tag', 'add', 'a@1.2.3', 'next', '--registry', NPMJS],
      expect.anything(),
    ],
  ])
  expect(publishPackage).toHaveBeenCalledTimes(1)
  expect(
    warnCalls().filter((message) =>
      message.includes('Treating publish of "a@1.2.3"')
    )
  ).toHaveLength(1)
  expect(context.outcome?.status).toBe('success')
})

test('rethrows the original publish error when the mid-publish race published different content', async () => {
  provideOIDCAuth()

  mountPackageFixture()

  context.plans = [createCompleteReleasePlan()]

  execCommand
    .mockImplementationOnce(async () => {
      throw notFoundError()
    })
    .mockImplementationOnce(async () => publishedManifest())

  downloadTarball.mockResolvedValue(Buffer.from('published-tarball'))

  isIdentical.mockReturnValueOnce(false)

  publishPackage.mockRejectedValueOnce(publishOverError())

  await expect(executeReleaseWorkflow(context, [plugin()])).rejects.toThrow(
    'You cannot publish over the previously published versions: 1.2.3.'
  )
})

test('rethrows the original publish error when the version is still absent after the race', async () => {
  provideOIDCAuth()

  mountPackageFixture()

  context.plans = [createCompleteReleasePlan()]

  execCommand.mockImplementationOnce(async () => {
    throw notFoundError()
  })

  publishPackage.mockRejectedValueOnce(publishOverError())

  await expect(executeReleaseWorkflow(context, [plugin()])).rejects.toThrow(
    'You cannot publish over the previously published versions: 1.2.3.'
  )
})

test('rethrows the original publish error when the version cannot be re-probed after the race', async () => {
  provideOIDCAuth()

  mountPackageFixture()

  context.plans = [createCompleteReleasePlan()]

  execCommand
    .mockImplementationOnce(async () => {
      throw notFoundError()
    })
    .mockImplementationOnce(async () => {
      throw new Error(
        `Command 'npm view a@1.2.3 --json --registry ${NPMJS}' failed (exit code 1)
npm error code E500
npm error 500 Internal server error`
      )
    })

  publishPackage.mockRejectedValueOnce(publishOverError())

  await expect(executeReleaseWorkflow(context, [plugin()])).rejects.toThrow(
    'You cannot publish over the previously published versions: 1.2.3.'
  )

  expect(execCommand).toHaveBeenCalledTimes(2)
})

test('rethrows non-race publish failures without re-probing', async () => {
  provideOIDCAuth()

  mountPackageFixture()

  context.plans = [createCompleteReleasePlan()]

  publishPackage.mockRejectedValueOnce(
    new Error("Command 'npm publish' failed (exit code 1) network unreachable")
  )

  await expect(executeReleaseWorkflow(context, [plugin()])).rejects.toThrow(
    'network unreachable'
  )

  expect(execCommand).toHaveBeenCalledTimes(1)
})

test('falls back to staged publishing when the registry requires staging', async () => {
  provideOIDCAuth()

  mountPackageFixture()

  context.plans = [createCompleteReleasePlan()]

  publishPackage.mockRejectedValueOnce(stageRequiredError())

  await executeReleaseWorkflow(context, [plugin()])

  expect(publishPackage).toHaveBeenCalledTimes(2)
  expect(
    publishPackage.mock.calls.map(
      (call) => (call[2] as { stage: boolean | undefined }).stage
    )
  ).toEqual([undefined, true])
  expect(
    warnCalls().filter((message) =>
      message.includes('Falling back to staged publish of "a@1.2.3"')
    )
  ).toHaveLength(1)
  expect(
    warnCalls().filter((message) =>
      message.includes('Packages were staged instead of published: "a@1.2.3"')
    )
  ).toHaveLength(1)
  expect(context.outcome?.status).toBe('success')
})

test('rethrows the stage-required rejection when the stage option disables the fallback', async () => {
  provideOIDCAuth()

  mountPackageFixture()

  context.plans = [createCompleteReleasePlan()]

  publishPackage.mockRejectedValueOnce(stageRequiredError())

  await expect(
    executeReleaseWorkflow(context, [plugin({ stage: false })])
  ).rejects.toThrow('E_STAGE_REQUIRED')

  expect(publishPackage).toHaveBeenCalledTimes(1)
  expect(
    warnCalls().filter((message) =>
      message.includes(
        'Staged publish fallback for "a@1.2.3" is disabled: the "stage" option is set to false.'
      )
    )
  ).toHaveLength(1)
})

test('rethrows the stage-required rejection when the package targets another registry', async () => {
  provideOIDCAuth()

  vol.fromJSON({
    '/repo/a/package.json': JSON.stringify({
      name: 'a',
      version: '1.2.2',
      publishConfig: { registry: 'https://registry.example.com/' },
    }),
  })

  context.plans = [createCompleteReleasePlan()]

  publishPackage.mockRejectedValueOnce(stageRequiredError())

  await expect(executeReleaseWorkflow(context, [plugin()])).rejects.toThrow(
    'E_STAGE_REQUIRED'
  )

  expect(publishPackage).toHaveBeenCalledTimes(1)
})

test('fails when the staged fallback publish fails', async () => {
  provideOIDCAuth()

  mountPackageFixture()

  context.plans = [createCompleteReleasePlan()]

  publishPackage
    .mockRejectedValueOnce(stageRequiredError())
    .mockRejectedValueOnce(new Error('staged publish failed'))

  await expect(executeReleaseWorkflow(context, [plugin()])).rejects.toThrow(
    'staged publish failed'
  )

  expect(publishPackage).toHaveBeenCalledTimes(2)
})

test('does not probe private, unnamed, unversioned, or foreign-provider plans', async () => {
  provideOIDCAuth()

  mountPackageFixture()

  context.plans = [
    createReleasePlan({
      name: 'a',
      location: 'a',
      releaseVersion: '1.2.3',
      private: true,
    }),
    createReleasePlan({ location: 'b', releaseVersion: '2.0.0' }),
    createReleasePlan({ name: 'c', location: 'c', releaseVersion: null }),
    createReleasePlan({
      name: 'd',
      location: 'd',
      releaseVersion: '3.0.0',
      provider: '@reelout/cargo',
    }),
  ]

  await executeReleaseWorkflow(context, [plugin()])

  expect(execCommand).toHaveBeenCalledTimes(0)
  expect(publishPackage).toHaveBeenCalledTimes(3)
  expect(
    publishPackage.mock.calls.map(
      (call) => (call[1] as ReleasePlan).package.name
    )
  ).toEqual(['a', undefined, 'c'])
})

test('probes with pnpm view and syncs the dist-tag when the workspace uses pnpm', async () => {
  provideOIDCAuth()

  context.releaseChannel = 'next'

  resolvePackageManager.mockResolvedValue('pnpm')

  mountPackageFixture()

  context.plans = [createCompleteReleasePlan()]

  execCommand.mockImplementationOnce(async () => publishedManifest({}))

  downloadTarball.mockResolvedValue(Buffer.from('published-tarball'))

  isIdentical.mockReturnValue(true)

  await executeReleaseWorkflow(context, [plugin()])

  expect(execCommand.mock.calls).toEqual([
    [
      'pnpm',
      ['view', 'a@1.2.3', '--json', '--registry', NPMJS],
      expect.anything(),
    ],
    [
      'pnpm',
      ['pack', '--pack-destination', expect.any(String)],
      expect.anything(),
    ],
    [
      'pnpm',
      ['dist-tag', 'add', 'a@1.2.3', 'next', '--registry', NPMJS],
      expect.anything(),
    ],
  ])
})

test('publishes when pnpm reports the version as missing', async () => {
  provideOIDCAuth()

  resolvePackageManager.mockResolvedValue('pnpm')

  mountPackageFixture()

  context.plans = [createCompleteReleasePlan()]

  execCommand.mockImplementationOnce(async () => {
    throw new Error(
      `Command 'pnpm view a@1.2.3 --json --registry ${NPMJS}' failed (exit code 1)
{
  "error": {
    "code": "ERR_PNPM_PACKAGE_NOT_FOUND",
    "message": "No matching version found for a@1.2.3"
  }
}`
    )
  })

  await executeReleaseWorkflow(context, [plugin()])

  expect(publishPackage).toHaveBeenCalledTimes(1)
})

test('probes with yarn npm info and syncs with yarn npm tag when the workspace uses yarn berry', async () => {
  provideOIDCAuth()

  context.releaseChannel = 'next'

  resolvePackageManager.mockResolvedValue('yarn')
  getPackageManagerVersion.mockResolvedValue(4)

  mountPackageFixture()

  context.plans = [createCompleteReleasePlan()]

  execCommand.mockImplementationOnce(async () => publishedManifest({}))

  downloadTarball.mockResolvedValue(Buffer.from('published-tarball'))

  isIdentical.mockReturnValue(true)

  await executeReleaseWorkflow(context, [plugin()])

  expect(execCommand.mock.calls).toEqual([
    ['yarn', ['npm', 'info', 'a@1.2.3', '--json'], expect.anything()],
    ['yarn', ['pack', '--out', expect.any(String)], expect.anything()],
    ['yarn', ['npm', 'tag', 'add', 'a@1.2.3', 'next'], expect.anything()],
  ])
})

test('treats yarn berry fallback metadata for a missing version as absent', async () => {
  provideOIDCAuth()

  resolvePackageManager.mockResolvedValue('yarn')
  getPackageManagerVersion.mockResolvedValue(4)

  mountPackageFixture()

  context.plans = [createCompleteReleasePlan()]

  execCommand.mockImplementationOnce(async () =>
    JSON.stringify({
      name: 'a',
      version: '2.1.3',
      dist: { tarball: `${NPMJS}a/-/a-2.1.3.tgz` },
      'dist-tags': { latest: '2.1.3' },
      versions: ['1.0.0', '2.1.3'],
    })
  )

  await executeReleaseWorkflow(context, [plugin()])

  expect(execCommand).toHaveBeenCalledTimes(1)
  expect(publishPackage).toHaveBeenCalledTimes(1)
})

test('probes with npm view and packs with yarn pack when the workspace uses yarn classic', async () => {
  provideOIDCAuth()

  context.releaseChannel = 'next'

  resolvePackageManager.mockResolvedValue('yarn')
  getPackageManagerVersion.mockResolvedValue(1)

  mountPackageFixture()

  context.plans = [createCompleteReleasePlan()]

  execCommand.mockImplementationOnce(async () => publishedManifest({}))

  downloadTarball.mockResolvedValue(Buffer.from('published-tarball'))

  isIdentical.mockReturnValue(true)

  await executeReleaseWorkflow(context, [plugin()])

  expect(execCommand.mock.calls).toEqual([
    [
      'npm',
      ['view', 'a@1.2.3', '--json', '--registry', NPMJS],
      expect.anything(),
    ],
    ['yarn', ['pack', '--filename', expect.any(String)], expect.anything()],
    [
      'npm',
      ['dist-tag', 'add', 'a@1.2.3', 'next', '--registry', NPMJS],
      expect.anything(),
    ],
  ])
})

test('probes with injected NPM_TOKEN credentials and publishes when the version is absent', async () => {
  context.env = { NPM_TOKEN: 'mock-npm-token' }

  mountPackageFixture()

  context.plans = [createCompleteReleasePlan()]

  await executeReleaseWorkflow(context, [plugin()])

  expect(execCommand.mock.calls).toEqual([
    [
      'npm',
      ['whoami', '--registry', NPMJS],
      {
        cwd: '/repo',
        env: {
          NPM_TOKEN: 'mock-npm-token',
          'npm_config_//registry.npmjs.org/:_authToken': 'mock-npm-token',
        },
        signal: undefined,
      },
    ],
    [
      'npm',
      ['view', 'a', '--json', '--registry', NPMJS],
      {
        cwd: '/repo/a',
        env: {
          NPM_TOKEN: 'mock-npm-token',
          'npm_config_//registry.npmjs.org/:_authToken': 'mock-npm-token',
        },
        signal: undefined,
      },
    ],
    [
      'npm',
      ['view', 'a@1.2.3', '--json', '--registry', NPMJS],
      {
        cwd: '/repo/a',
        env: {
          NPM_TOKEN: 'mock-npm-token',
          'npm_config_//registry.npmjs.org/:_authToken': 'mock-npm-token',
        },
        signal: undefined,
      },
    ],
  ])
  expect(publishPackage).toHaveBeenCalledTimes(1)
})

test('skips the publish after comparing real fixture tarballs end to end', async () => {
  provideOIDCAuth()

  context.releaseChannel = 'next'

  mountPackageFixture()

  context.plans = [createCompleteReleasePlan()]

  const publishedTarball = await packFixtureTarball(fixtureFiles, {
    prefix: 'package',
    mtime: new Date('2026-01-01T00:00:00.000Z'),
  })

  const localTarball = await packFixtureTarball(fixtureFiles, {
    mtime: new Date('2026-06-15T12:30:00.000Z'),
  })

  execCommand.mockImplementationOnce(async () => publishedManifest({}))

  downloadTarball.mockResolvedValue(publishedTarball)

  execCommand.mockImplementationOnce(
    async (command: string, args: readonly string[]) => {
      await writePackedTarball(args, localTarball)
      return ''
    }
  )

  await executeReleaseWorkflow(context, [plugin()])

  expect(publishPackage).toHaveBeenCalledTimes(0)
  expect(execCommand.mock.calls[2]).toEqual([
    'npm',
    ['dist-tag', 'add', 'a@1.2.3', 'next', '--registry', NPMJS],
    expect.anything(),
  ])
  expect(context.outcome?.status).toBe('success')
})

test('rejects before any publish when real fixture tarball content differs', async () => {
  provideOIDCAuth()

  mountPackageFixture()

  context.plans = [createCompleteReleasePlan()]

  const publishedTarball = await packFixtureTarball(fixtureFiles, {
    prefix: 'package',
  })

  const localTarball = await packFixtureTarball(
    [
      ...fixtureFiles,
      { path: 'extra.js', content: 'export const extra = 1\n' },
    ],
    {}
  )

  execCommand.mockImplementationOnce(async () => publishedManifest({}))

  downloadTarball.mockResolvedValue(publishedTarball)

  execCommand.mockImplementationOnce(
    async (command: string, args: readonly string[]) => {
      await writePackedTarball(args, localTarball)
      return ''
    }
  )

  await expect(executeReleaseWorkflow(context, [plugin()])).rejects.toThrow(
    'Version "a@1.2.3" was not published: the registry already has this version and its content could not be verified as identical.'
  )

  expect(publishPackage).toHaveBeenCalledTimes(0)
})
