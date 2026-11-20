// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import '../../../test/mock/env'
import '../../../test/mock/fs'

import { executeReleaseWorkflow, type ReleasePlan } from '@reelout/core'
import plugin, { PLUGIN_NAME } from '@reelout/npm'
import type { comparePackageTarballs } from '@reelout/npm/comparePackageTarballs'
import type { downloadPublishedTarball } from '@reelout/npm/downloadPublishedTarball'
import { vol } from 'memfs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { temporaryDirectoryTask } from 'tempy'
import { c as tarCreate } from 'tar'
import { beforeEach, expect, test, vi } from 'vitest'
import { context, logger } from '../../../test/mock/context'

const execCommand = vi.hoisted(() => vi.fn())

const publishPackage = vi.hoisted(() =>
  vi.fn(async (...args: unknown[]): Promise<void> => {})
)

const compareTarballs = vi.hoisted(() => vi.fn())

const downloadTarball = vi.hoisted(() => vi.fn())

const resolvePackageManager = vi.hoisted(() => vi.fn())

const getPackageManagerVersion = vi.hoisted(() => vi.fn())

vi.mock(import('@reelout/core/util/execCommand'), () => ({
  execCommand: (command: string, args: readonly string[], options: unknown) =>
    execCommand(command, args, options),
}))

vi.mock(import('@reelout/npm/publishPackage'), () => ({
  publishPackage: (...args: unknown[]) => publishPackage(...args),
}))

vi.mock(
  import('@reelout/npm/comparePackageTarballs'),
  async (importOriginal) => {
    const actual = await importOriginal<{
      comparePackageTarballs: typeof comparePackageTarballs
    }>()

    return {
      comparePackageTarballs: (published: Buffer, local: Buffer) =>
        compareTarballs(published, local) ??
        actual.comparePackageTarballs(published, local),
    }
  }
)

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

vi.mock(import('@reelout/npm/resolvePackageManager'), () => ({
  resolvePackageManager,
}))

vi.mock(import('@reelout/npm/getPackageManagerVersion'), () => ({
  getPackageManagerVersion,
}))

const NPMJS = 'https://registry.npmjs.org/'

interface CreatePlanOptions {
  name?: string | undefined
  location: string
  releaseVersion?: string | null | undefined
  private?: boolean | undefined
  provider?: string | undefined
}

function createPlan(options: CreatePlanOptions): ReleasePlan {
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

function createPublishablePlan(
  options: Partial<CreatePlanOptions> = {}
): ReleasePlan {
  return createPlan({
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
  distTags: Record<string, string> = { latest: '1.0.0' }
): string {
  return JSON.stringify({
    _id: 'a@1.2.3',
    name: 'a',
    version: '1.2.3',
    dist: { tarball: `${NPMJS}a/-/a-1.2.3.tgz` },
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

const provideOidcAuth = () => {
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

test('probes each publishable plan before publishing when the version is absent', async () => {
  provideOidcAuth()

  mountPackageFixture()

  context.plans = [
    createPublishablePlan(),
    createPlan({ name: 'b', location: 'b', releaseVersion: '2.0.0' }),
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
  expect(context.skippedSteps).toEqual([])
  expect(context.outcome?.status).toBe('success')
})

test('skips the publish and syncs the dist-tag when the registry already has an identical version', async () => {
  provideOidcAuth()

  context.releaseChannel = 'next'

  mountPackageFixture()

  context.plans = [createPublishablePlan()]

  execCommand.mockImplementationOnce(async () => publishedManifest())

  downloadTarball.mockResolvedValue(Buffer.from('published-tarball'))

  compareTarballs.mockReturnValue({ verdict: 'identical' })

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
  expect(context.skippedSteps).toEqual([
    {
      plugin: PLUGIN_NAME,
      hook: 'publish',
      reason: 'Version a@1.2.3 is already published with identical content.',
    },
  ])
  expect(
    warnCalls().filter((message) =>
      message.includes('Skipping publish of a@1.2.3')
    )
  ).toHaveLength(1)
  expect(context.outcome?.status).toBe('success')
})

test('does not run a dist-tag command when the channel tag already points at the released version', async () => {
  provideOidcAuth()

  context.releaseChannel = 'next'

  mountPackageFixture()

  context.plans = [createPublishablePlan()]

  execCommand.mockImplementationOnce(async () =>
    publishedManifest({ next: '1.2.3' })
  )

  downloadTarball.mockResolvedValue(Buffer.from('published-tarball'))

  compareTarballs.mockReturnValue({ verdict: 'identical' })

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
  expect(context.skippedSteps).toEqual([
    {
      plugin: PLUGIN_NAME,
      hook: 'publish',
      reason: 'Version a@1.2.3 is already published with identical content.',
    },
  ])
})

test('syncs the default latest dist-tag when no release channel is set', async () => {
  provideOidcAuth()

  mountPackageFixture()

  context.plans = [createPublishablePlan()]

  execCommand.mockImplementationOnce(async () => publishedManifest())

  downloadTarball.mockResolvedValue(Buffer.from('published-tarball'))

  compareTarballs.mockReturnValue({ verdict: 'identical' })

  await executeReleaseWorkflow(context, [plugin()])

  expect(execCommand.mock.calls[2]).toEqual([
    'npm',
    ['dist-tag', 'add', 'a@1.2.3', 'latest', '--registry', NPMJS],
    expect.anything(),
  ])
})

test('rejects before any publish when the registry version has different content', async () => {
  provideOidcAuth()

  mountPackageFixture()

  context.plans = [
    createPublishablePlan(),
    createPlan({ name: 'b', location: 'b', releaseVersion: '2.0.0' }),
  ]

  execCommand.mockImplementationOnce(async () => publishedManifest())

  downloadTarball.mockResolvedValue(Buffer.from('published-tarball'))

  compareTarballs.mockReturnValueOnce({
    verdict: 'different',
    summary: 'different content in: lib/index.js',
  })

  await expect(executeReleaseWorkflow(context, [plugin()])).rejects.toThrow(
    'Cannot publish a@1.2.3: the registry already has this version with different content (different content in: lib/index.js).'
  )

  expect(execCommand).toHaveBeenCalledTimes(2)
  expect(publishPackage).toHaveBeenCalledTimes(0)
  expect(context.skippedSteps).toEqual([])
})

test('rejects before any publish when the published content cannot be verified', async () => {
  provideOidcAuth()

  mountPackageFixture()

  context.plans = [createPublishablePlan()]

  execCommand.mockImplementationOnce(async () => publishedManifest())

  downloadTarball.mockResolvedValue(Buffer.from('published-tarball'))

  compareTarballs.mockReturnValueOnce({
    verdict: 'undeterminable',
    reason: 'the published tarball could not be parsed: truncated gzip stream',
  })

  await expect(executeReleaseWorkflow(context, [plugin()])).rejects.toThrow(
    'Cannot publish a@1.2.3: the published content could not be verified (the published tarball could not be parsed: truncated gzip stream).'
  )

  expect(publishPackage).toHaveBeenCalledTimes(0)
})

test('rejects before any publish when the published manifest lacks a tarball URL', async () => {
  provideOidcAuth()

  mountPackageFixture()

  context.plans = [createPublishablePlan()]

  execCommand.mockImplementationOnce(async () =>
    JSON.stringify({
      name: 'a',
      version: '1.2.3',
      'dist-tags': { latest: '1.2.3' },
    })
  )

  await expect(executeReleaseWorkflow(context, [plugin()])).rejects.toThrow(
    'Cannot publish a@1.2.3: the published content could not be verified (the published manifest does not include a tarball URL).'
  )

  expect(downloadTarball).toHaveBeenCalledTimes(0)
  expect(publishPackage).toHaveBeenCalledTimes(0)
})

test('rejects when the probe fails with an authentication error', async () => {
  provideOidcAuth()

  mountPackageFixture()

  context.plans = [createPublishablePlan()]

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
  provideOidcAuth()

  mountPackageFixture()

  context.plans = [createPublishablePlan()]

  execCommand.mockImplementationOnce(async () => 'not-json')

  await expect(executeReleaseWorkflow(context, [plugin()])).rejects.toThrow(
    'Could not parse registry metadata for a@1.2.3'
  )

  expect(publishPackage).toHaveBeenCalledTimes(0)
})

test('previews identical-version skips in dry-run without publishing or syncing dist-tags', async () => {
  provideOidcAuth()

  context.dryRun = true
  context.releaseChannel = 'next'

  mountPackageFixture()

  context.plans = [createPublishablePlan()]

  execCommand.mockImplementationOnce(async () => publishedManifest())

  downloadTarball.mockResolvedValue(Buffer.from('published-tarball'))

  compareTarballs.mockReturnValue({ verdict: 'identical' })

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
  expect(context.skippedSteps).toEqual([
    {
      plugin: PLUGIN_NAME,
      hook: 'publish',
      reason: 'Version a@1.2.3 is already published with identical content.',
    },
  ])
  expect(
    warnCalls().filter((message) =>
      message.includes('Skipping publish of a@1.2.3')
    )
  ).toHaveLength(1)
  expect(context.outcome?.status).toBe('success')
})

test('treats a mid-publish publish-over rejection with identical content as published', async () => {
  provideOidcAuth()

  context.releaseChannel = 'next'

  mountPackageFixture()

  context.plans = [createPublishablePlan()]

  execCommand
    .mockImplementationOnce(async () => {
      throw notFoundError()
    })
    .mockImplementationOnce(async () => publishedManifest({}))

  downloadTarball.mockResolvedValue(Buffer.from('published-tarball'))

  compareTarballs.mockReturnValue({ verdict: 'identical' })

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
  expect(context.skippedSteps).toEqual([
    {
      plugin: PLUGIN_NAME,
      hook: 'publish',
      reason:
        'Version a@1.2.3 was published concurrently with identical content.',
    },
  ])
  expect(
    warnCalls().filter((message) =>
      message.includes('Treating publish of a@1.2.3')
    )
  ).toHaveLength(1)
  expect(context.outcome?.status).toBe('success')
})

test('rethrows the original publish error when the mid-publish race published different content', async () => {
  provideOidcAuth()

  mountPackageFixture()

  context.plans = [createPublishablePlan()]

  execCommand
    .mockImplementationOnce(async () => {
      throw notFoundError()
    })
    .mockImplementationOnce(async () => publishedManifest())

  downloadTarball.mockResolvedValue(Buffer.from('published-tarball'))

  compareTarballs.mockReturnValueOnce({
    verdict: 'different',
    summary: 'different content in: lib/index.js',
  })

  publishPackage.mockRejectedValueOnce(publishOverError())

  await expect(executeReleaseWorkflow(context, [plugin()])).rejects.toThrow(
    'You cannot publish over the previously published versions: 1.2.3.'
  )

  expect(context.skippedSteps).toEqual([])
})

test('rethrows the original publish error when the mid-publish race cannot be verified', async () => {
  provideOidcAuth()

  mountPackageFixture()

  context.plans = [createPublishablePlan()]

  execCommand
    .mockImplementationOnce(async () => {
      throw notFoundError()
    })
    .mockImplementationOnce(async () => publishedManifest())

  downloadTarball.mockResolvedValue(Buffer.from('published-tarball'))

  compareTarballs.mockReturnValueOnce({
    verdict: 'undeterminable',
    reason: 'the published tarball could not be parsed: truncated gzip stream',
  })

  publishPackage.mockRejectedValueOnce(publishOverError())

  await expect(executeReleaseWorkflow(context, [plugin()])).rejects.toThrow(
    'You cannot publish over the previously published versions: 1.2.3.'
  )
})

test('rethrows the original publish error when the version cannot be probed after the race', async () => {
  provideOidcAuth()

  mountPackageFixture()

  context.plans = [createPublishablePlan()]

  execCommand.mockImplementationOnce(async () => {
    throw notFoundError()
  })

  publishPackage.mockRejectedValueOnce(publishOverError())

  await expect(executeReleaseWorkflow(context, [plugin()])).rejects.toThrow(
    'You cannot publish over the previously published versions: 1.2.3.'
  )
})

test('rethrows non-race publish failures without re-probing', async () => {
  provideOidcAuth()

  mountPackageFixture()

  context.plans = [createPublishablePlan()]

  publishPackage.mockRejectedValueOnce(
    new Error("Command 'npm publish' failed (exit code 1) network unreachable")
  )

  await expect(executeReleaseWorkflow(context, [plugin()])).rejects.toThrow(
    'network unreachable'
  )

  expect(execCommand).toHaveBeenCalledTimes(1)
})

test('does not probe private, unnamed, unversioned, or foreign-provider plans', async () => {
  provideOidcAuth()

  mountPackageFixture()

  context.plans = [
    createPlan({
      name: 'a',
      location: 'a',
      releaseVersion: '1.2.3',
      private: true,
    }),
    createPlan({ location: 'b', releaseVersion: '2.0.0' }),
    createPlan({ name: 'c', location: 'c', releaseVersion: null }),
    createPlan({
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
  provideOidcAuth()

  context.releaseChannel = 'next'

  resolvePackageManager.mockResolvedValue('pnpm')

  mountPackageFixture()

  context.plans = [createPublishablePlan()]

  execCommand.mockImplementationOnce(async () => publishedManifest({}))

  downloadTarball.mockResolvedValue(Buffer.from('published-tarball'))

  compareTarballs.mockReturnValue({ verdict: 'identical' })

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
  provideOidcAuth()

  resolvePackageManager.mockResolvedValue('pnpm')

  mountPackageFixture()

  context.plans = [createPublishablePlan()]

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
  expect(context.skippedSteps).toEqual([])
})

test('probes with yarn npm info and syncs with yarn npm tag when the workspace uses yarn berry', async () => {
  provideOidcAuth()

  context.releaseChannel = 'next'

  resolvePackageManager.mockResolvedValue('yarn')
  getPackageManagerVersion.mockResolvedValue(4)

  mountPackageFixture()

  context.plans = [createPublishablePlan()]

  execCommand.mockImplementationOnce(async () => publishedManifest({}))

  downloadTarball.mockResolvedValue(Buffer.from('published-tarball'))

  compareTarballs.mockReturnValue({ verdict: 'identical' })

  await executeReleaseWorkflow(context, [plugin()])

  expect(execCommand.mock.calls).toEqual([
    ['yarn', ['npm', 'info', 'a@1.2.3', '--json'], expect.anything()],
    ['yarn', ['pack', '--out', expect.any(String)], expect.anything()],
    ['yarn', ['npm', 'tag', 'add', 'a@1.2.3', 'next'], expect.anything()],
  ])
})

test('treats yarn berry fallback metadata for a missing version as absent', async () => {
  provideOidcAuth()

  resolvePackageManager.mockResolvedValue('yarn')
  getPackageManagerVersion.mockResolvedValue(4)

  mountPackageFixture()

  context.plans = [createPublishablePlan()]

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
  expect(context.skippedSteps).toEqual([])
})

test('probes with npm view and packs with yarn pack when the workspace uses yarn classic', async () => {
  provideOidcAuth()

  context.releaseChannel = 'next'

  resolvePackageManager.mockResolvedValue('yarn')
  getPackageManagerVersion.mockResolvedValue(1)

  mountPackageFixture()

  context.plans = [createPublishablePlan()]

  execCommand.mockImplementationOnce(async () => publishedManifest({}))

  downloadTarball.mockResolvedValue(Buffer.from('published-tarball'))

  compareTarballs.mockReturnValue({ verdict: 'identical' })

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

  context.plans = [createPublishablePlan()]

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

test('skips the publish after comparing real fixture tarballs end to end', async () => {
  provideOidcAuth()

  context.releaseChannel = 'next'

  mountPackageFixture()

  context.plans = [createPublishablePlan()]

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
  expect(context.skippedSteps).toEqual([
    {
      plugin: PLUGIN_NAME,
      hook: 'publish',
      reason: 'Version a@1.2.3 is already published with identical content.',
    },
  ])
  expect(execCommand.mock.calls[2]).toEqual([
    'npm',
    ['dist-tag', 'add', 'a@1.2.3', 'next', '--registry', NPMJS],
    expect.anything(),
  ])
  expect(context.outcome?.status).toBe('success')
})

test('rejects with the real difference summary when local fixture content differs', async () => {
  provideOidcAuth()

  mountPackageFixture()

  context.plans = [createPublishablePlan()]

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
    'only in local tarball: extra.js'
  )

  expect(publishPackage).toHaveBeenCalledTimes(0)
})
