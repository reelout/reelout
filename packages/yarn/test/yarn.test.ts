// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import '../../../test/mock/env'
import '../../../test/mock/fs'

import { executeReleaseWorkflow, type ReleasePlan } from '@reelout/core'
import plugin, { PLUGIN_NAME } from '@reelout/yarn'
import { createHash } from 'node:crypto'
import { vol } from 'memfs'
import { readFile, writeFile } from 'node:fs/promises'
import { beforeEach, expect, test, vi } from 'vitest'
import {
  context,
  createMockRepository,
  logger,
} from '../../../test/mock/context'

const execCommand = vi.hoisted(() => vi.fn())

const publishPackage = vi.hoisted(() => vi.fn())

const isGitHubRepositoryPublic = vi.hoisted(() => vi.fn())

const isPackageTarballIdentical = vi.hoisted(() => vi.fn())

const downloadPublishedTarball = vi.hoisted(() => vi.fn())

const resolvePackageManager = vi.hoisted(() => vi.fn())

const getPackageManagerVersion = vi.hoisted(() => vi.fn())

vi.mock(import('@reelout/core/util/execCommand'), () => ({
  execCommand: (command, args, options) => execCommand(command, args, options),
}))

vi.mock(
  import('@reelout/npm/downloadPublishedTarball'),
  async (importActual) => ({
    downloadPublishedTarball: async (...args) =>
      downloadPublishedTarball(...args) ??
      (await importActual()).downloadPublishedTarball(...args),
  })
)

vi.mock(
  import('@reelout/npm/isPackageTarballIdentical'),
  async (importActual) => {
    const actual = await importActual()

    return {
      isPackageTarballIdentical: (published, local) =>
        isPackageTarballIdentical(published, local) ??
        actual.isPackageTarballIdentical(published, local),
    }
  }
)

vi.mock(import('@reelout/npm/getPackageManagerVersion'), () => ({
  getPackageManagerVersion,
}))

vi.mock(import('@reelout/npm/publishPackage'), () => ({
  publishPackage: (context, ...args) => publishPackage(context.cwd, ...args),
}))

vi.mock(import('@reelout/npm/resolvePackageManager'), () => ({
  resolvePackageManager,
}))

vi.mock(import('@reelout/github/isRepositoryPublic'), () => ({
  isRepositoryPublic: isGitHubRepositoryPublic,
}))

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
    flag === '--pack-destination' ? `${destination}/package.tgz` : destination

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
    `Command 'yarn npm info a@1.2.3 --json' failed (exit code 1)
Response Code: 404`
  )

const stageRequiredError = () =>
  new Error(
    `Command 'yarn npm publish' failed (exit code 1)
npm error code E_STAGE_REQUIRED
npm error 403 Forbidden - direct publishing is disabled for this package: use staged publishing`
  )

const provideNpmTokenAuth = () => {
  context.env = { NPM_TOKEN: 'mock-npm-token' }
}

function mountPackageFixture(): void {
  vol.fromJSON({
    '/repo/package.json': JSON.stringify({ name: 'root', version: '0.0.0' }),
    '/repo/a/package.json': JSON.stringify({ name: 'a', version: '1.2.2' }),
  })
}

const warnCalls = (): string[] =>
  logger.mock.calls.flatMap(([message]) =>
    typeof message === 'string' ? [message] : []
  )

beforeEach(() => {
  vi.resetAllMocks()

  resolvePackageManager.mockResolvedValue('yarn')
  getPackageManagerVersion.mockResolvedValue(4)

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

  downloadPublishedTarball.mockRejectedValue(
    new Error('downloadPublishedTarball was not configured for this test')
  )
})

test('stays inactive without a root package manifest', async () => {
  vol.fromJSON({
    '/repo/a/package.json': JSON.stringify({ name: 'a', version: '0.0.0' }),
  })

  context.plans = [createCompleteReleasePlan()]

  await executeReleaseWorkflow(context, [plugin()])

  expect(publishPackage).not.toHaveBeenCalled()
  expect(context.outcome?.status).toBe('success')
  expect(
    warnCalls().filter((message) => message.includes('Yarn plugin is inactive'))
  ).toHaveLength(0)

  expect(JSON.parse(await readFile('/repo/a/package.json', 'utf8'))).toEqual({
    name: 'a',
    version: '0.0.0',
  })
})

test('stays inactive when another package manager is active', async () => {
  resolvePackageManager.mockResolvedValue('npm')

  mountPackageFixture()

  context.plans = [createCompleteReleasePlan()]

  await executeReleaseWorkflow(context, [plugin()])

  expect(publishPackage).not.toHaveBeenCalled()
  expect(context.outcome?.status).toBe('success')
  expect(
    warnCalls().filter((message) => message.includes('Yarn plugin is inactive'))
  ).toHaveLength(0)
})

test('stays inactive in strict mode when another package manager is active', async () => {
  resolvePackageManager.mockResolvedValue('npm')

  context.strict = true

  mountPackageFixture()

  context.plans = [createCompleteReleasePlan()]

  await executeReleaseWorkflow(context, [plugin()])

  expect(publishPackage).not.toHaveBeenCalled()
  expect(context.outcome?.status).toBe('success')
})

test('skips the publish phase with a warning when no registry authentication exists', async () => {
  mountPackageFixture()

  context.plans = [createCompleteReleasePlan()]

  await executeReleaseWorkflow(context, [plugin()])

  expect(
    warnCalls().filter((message) =>
      message.includes(
        'Packages will not be published: NPM_TOKEN is required for Yarn authentication.'
      )
    )
  ).toHaveLength(1)

  expect(publishPackage).not.toHaveBeenCalled()
  expect(context.outcome?.status).toBe('success')
})

test('fails in strict mode when no registry authentication exists', async () => {
  mountPackageFixture()

  context.strict = true

  context.plans = [createCompleteReleasePlan()]

  await expect(executeReleaseWorkflow(context, [plugin()])).rejects.toThrow(
    'NPM_TOKEN is required for Yarn authentication in strict mode.'
  )
})

test('rejects when the authentication pre-flight reports invalid credentials', async () => {
  mountPackageFixture()

  provideNpmTokenAuth()

  execCommand.mockRejectedValueOnce(
    new Error('npm error code E401 npm error 401 Unauthorized')
  )

  await expect(executeReleaseWorkflow(context, [plugin()])).rejects.toThrow(
    'NPM_TOKEN or ambient registry credentials are invalid or expired.'
  )
})

test('publishes packages with Yarn Berry under NPM_TOKEN authentication', async () => {
  provideNpmTokenAuth()

  mountPackageFixture()

  const plan = createCompleteReleasePlan()

  context.plans = [plan]

  await executeReleaseWorkflow(context, [plugin()])

  expect(publishPackage).toHaveBeenCalledTimes(1)
  expect(publishPackage.mock.calls[0]?.[1]).toBe(plan)
  expect(publishPackage.mock.calls[0]?.[2]).toEqual({
    dryRun: false,
    tag: undefined,
    access: undefined,
    provenance: undefined,
    stage: undefined,
  })
})

test('enables provenance when the manifest repository is public', async () => {
  provideNpmTokenAuth()

  context.env = { ...context.env, GITHUB_TOKEN: 'mock-github-token' }

  context.repository = createMockRepository('github')

  vol.fromJSON({
    '/repo/package.json': JSON.stringify({
      name: 'root',
      version: '0.0.0',
      repository: {
        type: 'git',
        url: 'https://github.com/mock-owner/mock-repo.git',
      },
    }),
    '/repo/a/package.json': JSON.stringify({ name: 'a', version: '1.2.2' }),
  })

  isGitHubRepositoryPublic.mockResolvedValue(true)

  context.plans = [createCompleteReleasePlan()]

  await executeReleaseWorkflow(context, [plugin()])

  expect(publishPackage).toHaveBeenCalledTimes(1)
  expect(publishPackage.mock.calls[0]?.[2]).toMatchObject({ provenance: true })
})

test('names the yarn npm stage commands in the staged summary', async () => {
  provideNpmTokenAuth()

  mountPackageFixture()

  context.plans = [createCompleteReleasePlan()]

  publishPackage.mockRejectedValueOnce(stageRequiredError())

  await executeReleaseWorkflow(context, [plugin()])

  expect(publishPackage).toHaveBeenCalledTimes(2)

  expect(
    warnCalls().filter((message) =>
      message.includes(
        'with "yarn npm stage list" and finish the release with "yarn npm stage approve <stage-id>"'
      )
    )
  ).toHaveLength(1)
})

test('rethrows the stage-required rejection when the stage option disables the fallback', async () => {
  provideNpmTokenAuth()

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
        'Staged publish fallback for "a@1.2.3" is disabled by the "stage" option, but the registry requires staged publishing. Set "stage" to true or remove the option to enable staged publishing.'
      )
    )
  ).toHaveLength(1)
})

test('rethrows the stage-required rejection when the package targets another registry', async () => {
  provideNpmTokenAuth()

  vol.fromJSON({
    '/repo/package.json': JSON.stringify({ name: 'root', version: '0.0.0' }),
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

test('probes with yarn npm info and syncs with yarn npm tag when the workspace uses yarn berry', async () => {
  provideNpmTokenAuth()

  context.releaseChannel = 'next'

  mountPackageFixture()

  context.plans = [createCompleteReleasePlan()]

  execCommand.mockImplementation(
    async (command: string, args: readonly string[]) => {
      if (args.includes('whoami')) return ''

      if (args.includes('view') || args.includes('info')) {
        if (args.includes('a@1.2.3')) {
          return publishedManifest({})
        }

        throw notFoundError()
      }

      if (args.includes('pack')) {
        await writePackedTarball(args, 'packed-tarball')
        return ''
      }

      return ''
    }
  )

  downloadPublishedTarball.mockResolvedValue(Buffer.from('published-tarball'))

  isPackageTarballIdentical.mockReturnValue(true)

  await executeReleaseWorkflow(context, [plugin()])

  expect(execCommand.mock.calls).toEqual([
    ['yarn', ['npm', 'whoami', '--publish'], expect.anything()],
    ['yarn', ['npm', 'info', 'a', '--json'], expect.anything()],
    ['yarn', ['npm', 'info', 'a@1.2.3', '--json'], expect.anything()],
    ['yarn', ['pack', '--out', expect.any(String)], expect.anything()],
    ['yarn', ['npm', 'tag', 'add', 'a@1.2.3', 'next'], expect.anything()],
  ])

  expect(publishPackage).not.toHaveBeenCalled()
})

test('skips the tarball download when the local pack matches the recorded integrity', async () => {
  provideNpmTokenAuth()

  context.releaseChannel = 'next'

  mountPackageFixture()

  context.plans = [createCompleteReleasePlan()]

  const integrity = `sha512-${createHash('sha512')
    .update('packed-tarball')
    .digest('base64')}`

  execCommand.mockImplementation(
    async (command: string, args: readonly string[]) => {
      if (args.includes('whoami')) return ''

      if (args.includes('view') || args.includes('info')) {
        if (args.includes('a@1.2.3')) {
          return publishedManifest({}, integrity)
        }

        throw notFoundError()
      }

      if (args.includes('pack')) {
        await writePackedTarball(args, 'packed-tarball')
        return ''
      }

      return ''
    }
  )

  await executeReleaseWorkflow(context, [plugin()])

  expect(downloadPublishedTarball).not.toHaveBeenCalled()
  expect(publishPackage).not.toHaveBeenCalled()
})

test('treats yarn berry fallback metadata for a missing version as absent', async () => {
  provideNpmTokenAuth()

  mountPackageFixture()

  context.plans = [createCompleteReleasePlan()]

  execCommand.mockImplementation(
    async (command: string, args: readonly string[]) => {
      if (args.includes('whoami')) return ''

      if (args.includes('view') || args.includes('info')) {
        if (args.includes('a@1.2.3')) {
          return JSON.stringify({
            name: 'a',
            version: '2.1.3',
            dist: { tarball: `${NPMJS}a/-/a-2.1.3.tgz` },
            'dist-tags': { latest: '2.1.3' },
            versions: ['1.0.0', '2.1.3'],
          })
        }

        throw notFoundError()
      }

      return ''
    }
  )

  await executeReleaseWorkflow(context, [plugin()])

  expect(publishPackage).toHaveBeenCalledTimes(1)
})

test('probes with npm view and packs with yarn pack when the workspace uses yarn classic', async () => {
  provideNpmTokenAuth()

  getPackageManagerVersion.mockResolvedValue(1)

  context.releaseChannel = 'next'

  mountPackageFixture()

  context.plans = [createCompleteReleasePlan()]

  execCommand.mockImplementation(
    async (command: string, args: readonly string[]) => {
      if (args.includes('whoami')) return ''

      if (args.includes('view') || args.includes('info')) {
        if (args.includes('a@1.2.3')) {
          return publishedManifest({})
        }

        throw notFoundError()
      }

      if (args.includes('pack')) {
        await writePackedTarball(args, 'packed-tarball')
        return ''
      }

      return ''
    }
  )

  downloadPublishedTarball.mockResolvedValue(Buffer.from('published-tarball'))

  isPackageTarballIdentical.mockReturnValue(true)

  await executeReleaseWorkflow(context, [plugin()])

  expect(execCommand.mock.calls).toEqual([
    ['npm', ['whoami', '--registry', NPMJS], expect.anything()],
    ['npm', ['view', 'a', '--json', '--registry', NPMJS], expect.anything()],
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

  expect(publishPackage).not.toHaveBeenCalled()
})
