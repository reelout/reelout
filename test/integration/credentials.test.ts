// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import '../mock/env'
import '../mock/git'
import '../mock/util'

import { resolveConfig } from '@reelout/config'
import { createContext } from '@reelout/context'
import {
  compact,
  createPlugin,
  execGit,
  executeReleaseWorkflow,
  type ReleaseContext,
  type ReleasePlugin,
} from '@reelout/core'
import { createRelease } from '@reelout/github/createRelease'
import { writePackageJson } from '@reelout/npm'
import { probePublishedVersion } from '@reelout/npm/probePublishedVersion'
import { proveSamePublication } from '@reelout/npm/proveSamePublication'
import { publishPackage } from '@reelout/npm/publishPackage'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { temporaryDirectoryTask } from 'tempy'
import { beforeAll, beforeEach, expect, test, vi, type Mock } from 'vitest'
import { createMockLogger } from '../mock/context'
import {
  getGitCommitSubjects,
  getGitTags,
  initializeGitRepository,
} from '../mock/git'

const execCommand = vi.hoisted(() => vi.fn())

vi.mock(import('@reelout/core/util/execCommand'), async (importActual) => {
  const actual = await importActual()

  return {
    execCommand: ((
      command: string,
      args: readonly string[],
      options: Parameters<typeof actual.execCommand>[2]
    ) => {
      const result = execCommand(command, args, options)

      return result === undefined
        ? actual.execCommand(command, args, options)
        : result
    }) as typeof actual.execCommand,
  }
})

vi.mock(import('@reelout/npm/publishPackage'), () => ({
  publishPackage: vi.fn(),
}))

vi.mock(import('@reelout/github/createRelease'), () => ({
  createRelease: vi.fn(async () => async () => {}),
}))

vi.mock(import('@reelout/github/verifyToken'), () => ({
  verifyToken: vi.fn(async () => {}),
}))

vi.mock(import('@reelout/github/isRepositoryPublic'), () => ({
  isRepositoryPublic: vi.fn(async () => true),
}))

vi.mock(import('@reelout/npm/probePublishedVersion'), async (importActual) => {
  const actual = await importActual()

  return {
    ...actual,
    probePublishedVersion: vi.fn(),
  }
})

vi.mock(import('@reelout/npm/proveSamePublication'), () => ({
  proveSamePublication: vi.fn(),
}))

beforeAll(() => {
  vi.useFakeTimers({ now: new Date('2026-01-01T00:00:00Z') })
})

const npmCommandCalls = () =>
  execCommand.mock.calls.filter(([command]) => command === 'npm')

interface WorkflowOptions {
  dryRun?: boolean | undefined
  strict?: boolean | undefined
}

async function prepareWorkflow(
  cwd: string,
  logger: Mock,
  options: WorkflowOptions = {}
): Promise<{ context: ReleaseContext; plugins: ReleasePlugin[] }> {
  const config = await resolveConfig(cwd)

  const context = await createContext({
    ...config,
    cwd,
    env: process.env,
    stdout: process.stdout,
    stderr: process.stderr,
    logger: createMockLogger(logger),
    ...options,
  })

  const plugins = compact(await Promise.all(config.plugins.map(createPlugin)))

  return { context, plugins }
}

async function initializeReleaseRepository(
  remote: string,
  cwd: string,
  manifest: Record<string, unknown>
): Promise<void> {
  await initializeGitRepository(cwd, remote)

  await writePackageJson(cwd, manifest)
  await execGit(cwd, ['add', '.'])
  await execGit(cwd, ['commit', '-m', 'chore: add package.json'])

  await writeFile(path.join(cwd, 'index.js'), 'export const foo = 42;')
  await execGit(cwd, ['add', '.'])
  await execGit(cwd, ['commit', '-m', 'feat: add index file'])
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('GITHUB_ACTIONS', undefined)
  vi.stubEnv('GITHUB_STEP_SUMMARY', undefined)
  vi.stubEnv('GITHUB_TOKEN', 'mock-github-token')
  vi.stubEnv('NPM_ID_TOKEN', 'mock-id-token')

  execCommand.mockImplementation((command: string) => {
    if (command === 'npm') {
      return Promise.resolve('')
    }

    return undefined
  })
})

test('skips npm publishing and GitHub releases while completing the release when credentials are missing', async () => {
  await temporaryDirectoryTask(async (remote) => {
    await temporaryDirectoryTask(async (cwd) => {
      await initializeReleaseRepository(remote, cwd, { version: '0.0.0' })

      vi.stubEnv('GITHUB_TOKEN', undefined)
      vi.stubEnv('NPM_ID_TOKEN', undefined)
      vi.stubEnv('GITHUB_ACTIONS', 'true')
      vi.stubEnv('GITHUB_STEP_SUMMARY', path.join(remote, 'summary.md'))

      const logger = vi.fn()

      const { context, plugins } = await prepareWorkflow(cwd, logger)

      await executeReleaseWorkflow(context, plugins)

      expect(context.outcome?.status).toBe('success')
      expect(npmCommandCalls()).toEqual([])
      expect(vi.mocked(publishPackage)).not.toHaveBeenCalled()
      expect(vi.mocked(createRelease)).not.toHaveBeenCalled()
      expect(await getGitTags(cwd)).toMatchInlineSnapshot(`
        [
          "v0.1.0 ## Features

        - add index file ([89bdcb0](https://github.com/mock-owner/mock-repo/commit/89bdcb053a8af71f684639372fee6d25f44eb857))",
        ]
      `)
      expect(logger.mock.calls).toMatchInlineSnapshot(`
        [
          [
            "[33mPackages will not be published: NPM_TOKEN is required for NPM authentication.[39m",
          ],
          [
            "GitHub releases will not be created: GITHUB_TOKEN is not set.",
          ],
          [
            "Status: [32mSUCCESS[39m",
          ],
          [
            "Release complete: [1m[32m1 released[39m[22m [90m(1)[39m

        [42m 0.1.0 ← 0.0.0 [49m[90m minor [39m

        [36m## 0.1.0 (2026-01-01)[39m

        [36m### Features[39m

        - add index file ([89bdcb0](https://github.com/mock-owner/mock-repo/commit/89bdcb053a8af71f684639372fee6d25f44eb857))
        ",
          ],
        ]
      `)
      expect(await readFile(path.join(remote, 'summary.md'), 'utf8'))
        .toMatchInlineSnapshot(`
        "
        ## ReelOut Release Report

        **Status:** Success

        | Package | Version | Type | Tag |
        | --- | --- | --- | --- |
        | \`.\` | \`0.1.0\` ← \`0.0.0\` | minor | \`v0.1.0\` |

        <details>
        <summary>\`.\` 0.1.0</summary>

        ## 0.1.0 (2026-01-01)

        ### Features

        - add index file ([89bdcb0](https://github.com/mock-owner/mock-repo/commit/89bdcb053a8af71f684639372fee6d25f44eb857))

        </details>
        "
      `)
    })
  })
}, 15_000)

test('rejects with the npm configure error before any write-phase mutation when credentials are missing in strict mode', async () => {
  await temporaryDirectoryTask(async (remote) => {
    await temporaryDirectoryTask(async (cwd) => {
      await initializeReleaseRepository(remote, cwd, { version: '0.0.0' })

      vi.stubEnv('GITHUB_TOKEN', undefined)
      vi.stubEnv('NPM_ID_TOKEN', undefined)

      const logger = vi.fn()

      const { context, plugins } = await prepareWorkflow(cwd, logger, {
        strict: true,
      })

      await expect(
        executeReleaseWorkflow(context, plugins)
      ).rejects.toMatchInlineSnapshot(
        '[Error: NPM_TOKEN is required for NPM authentication in strict mode.]'
      )

      expect(context.outcome).toMatchInlineSnapshot(`
        {
          "error": [Error: NPM_TOKEN is required for NPM authentication in strict mode.],
          "phase": {
            "hook": "configure",
            "plugin": "@reelout/npm",
          },
          "status": "failure",
        }
      `)
      expect(await getGitTags(cwd)).toEqual([])
      expect(await getGitCommitSubjects(cwd)).toEqual([
        'chore: add package.json',
        'feat: add index file',
      ])
      expect(npmCommandCalls()).toEqual([])
      expect(vi.mocked(publishPackage)).not.toHaveBeenCalled()
      expect(vi.mocked(createRelease)).not.toHaveBeenCalled()
    })
  })
}, 15_000)

test('previews missing credentials without side effects in dry-run', async () => {
  await temporaryDirectoryTask(async (remote) => {
    await temporaryDirectoryTask(async (cwd) => {
      await initializeReleaseRepository(remote, cwd, { version: '0.0.0' })

      vi.stubEnv('GITHUB_TOKEN', undefined)
      vi.stubEnv('NPM_ID_TOKEN', undefined)

      const logger = vi.fn()

      const { context, plugins } = await prepareWorkflow(cwd, logger, {
        dryRun: true,
      })

      await executeReleaseWorkflow(context, plugins)

      expect(context.outcome?.status).toBe('success')
      expect(await getGitTags(cwd)).toEqual([])
      expect(await getGitCommitSubjects(cwd)).toEqual([
        'chore: add package.json',
        'feat: add index file',
      ])
      expect(npmCommandCalls()).toEqual([])
      expect(vi.mocked(publishPackage)).not.toHaveBeenCalled()
      expect(vi.mocked(createRelease)).not.toHaveBeenCalled()
      expect(logger.mock.calls).toMatchInlineSnapshot(`
        [
          [
            "[33mPackages will not be published: NPM_TOKEN is required for NPM authentication.[39m",
          ],
          [
            "GitHub releases will not be created: GITHUB_TOKEN is not set.",
          ],
          [
            "Status: [32mSUCCESS[39m [33m(dry run)[39m",
          ],
          [
            "Release complete: [1m[32m1 released[39m[22m [90m(1)[39m

        [42m 0.1.0 ← 0.0.0 [49m[90m minor [39m

        [36m## 0.1.0 (2026-01-01)[39m

        [36m### Features[39m

        - add index file ([aefee9d](https://github.com/mock-owner/mock-repo/commit/aefee9d6c916cb8bc54b2f4016f52415a1d5e593))
        ",
          ],
        ]
      `)
    })
  })
}, 15_000)

test('completes an already published npm plan with a synced dist-tag and no publish', async () => {
  await temporaryDirectoryTask(async (remote) => {
    await temporaryDirectoryTask(async (cwd) => {
      await initializeReleaseRepository(remote, cwd, {
        name: 'pkg',
        version: '0.0.0',
      })

      vi.mocked(probePublishedVersion).mockResolvedValue({
        status: 'published',
        tarballUrl: 'https://registry.npmjs.org/pkg/-/pkg-0.1.0.tgz',
        integrity: undefined,
        distTags: {},
      })

      vi.mocked(proveSamePublication).mockResolvedValue(true)

      const logger = vi.fn()

      const { context, plugins } = await prepareWorkflow(cwd, logger)

      await executeReleaseWorkflow(context, plugins)

      expect(context.outcome?.status).toBe('success')
      expect(vi.mocked(publishPackage)).not.toHaveBeenCalled()
      expect(npmCommandCalls()).toEqual([
        [
          'npm',
          [
            'dist-tag',
            'add',
            'pkg@0.1.0',
            'latest',
            '--registry',
            'https://registry.npmjs.org/',
          ],
          expect.objectContaining({ cwd }),
        ],
      ])
      expect(vi.mocked(createRelease)).toHaveBeenCalledTimes(1)
      expect(await getGitTags(cwd)).toMatchInlineSnapshot(`
        [
          "v0.1.0 ## Features

        - add index file ([5741223](https://github.com/mock-owner/mock-repo/commit/5741223b0fa8d6c324e51c3a5c814c75baa9d773))",
        ]
      `)
      expect(logger.mock.calls).toMatchInlineSnapshot(`
        [
          [
            "[33mCould not verify publish permission for "pkg@0.1.0": the registry will reject the publish if access is missing.[39m",
          ],
          [
            "[33mSkipping publish of "pkg@0.1.0": already published with identical content.[39m",
          ],
          [
            "Status: [32mSUCCESS[39m",
          ],
          [
            "Release complete: [1m[32m1 released[39m[22m [90m(1)[39m

        [44m pkg [49m[42m 0.1.0 ← 0.0.0 [49m[90m minor [39m

        [36m## 0.1.0 (2026-01-01)[39m

        [36m### Features[39m

        - add index file ([5741223](https://github.com/mock-owner/mock-repo/commit/5741223b0fa8d6c324e51c3a5c814c75baa9d773))
        ",
          ],
        ]
      `)
    })
  })
}, 15_000)
