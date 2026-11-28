// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { inspectVersionedPackageManager } from '@reelout/npm'
import { temporaryDirectoryTask } from 'tempy'
import { beforeEach, expect, test, vi } from 'vitest'
import { context } from '../../../test/mock/context'

const resolvePackageManager = vi.hoisted(() => vi.fn())

const getPackageManagerVersion = vi.hoisted(() => vi.fn())

const getPackageManagerFullVersion = vi.hoisted(() => vi.fn())

vi.mock(import('@reelout/npm/resolvePackageManager'), () => ({
  resolvePackageManager,
}))

vi.mock(import('@reelout/npm/getPackageManagerVersion'), () => ({
  getPackageManagerVersion,
}))

vi.mock(import('@reelout/npm/getPackageManagerFullVersion'), () => ({
  getPackageManagerFullVersion,
}))

beforeEach(() => {
  vi.resetAllMocks()

  resolvePackageManager.mockResolvedValue('yarn')
  getPackageManagerVersion.mockResolvedValue(4)
  getPackageManagerFullVersion.mockResolvedValue('4.9.0')
})

test('resolves the full yarn version when OIDC tokens could publish with yarn berry on GitHub Actions', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_ID_TOKEN: 'mock-id-token', GITHUB_ACTIONS: 'true' }

    expect(await inspectVersionedPackageManager(context))
      .toMatchInlineSnapshot(`
      {
        "isNpm": false,
        "isPnpm": false,
        "isYarn": true,
        "isYarnBerry": true,
        "isYarnClassic": false,
        "name": "yarn",
        "version": "4.9.0",
      }
    `)

    expect(getPackageManagerFullVersion).toHaveBeenCalledWith(cwd, 'yarn', {
      env: context.env,
      signal: undefined,
    })
  })
})

test('resolves the full yarn version when OIDC tokens could publish with yarn berry on GitLab CI', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_ID_TOKEN: 'mock-id-token', GITLAB_CI: 'true' }

    expect((await inspectVersionedPackageManager(context)).version).toBe(
      '4.9.0'
    )
  })
})

test('resolves the full yarn version when OIDC tokens could publish with yarn berry on CircleCI', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_ID_TOKEN: 'mock-id-token', CIRCLECI: 'true' }

    expect((await inspectVersionedPackageManager(context)).version).toBe(
      '4.9.0'
    )
  })
})

test('skips the version query without OIDC environment tokens', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { GITHUB_ACTIONS: 'true' }

    const packageManager = await inspectVersionedPackageManager(context)

    expect(packageManager.isYarnBerry).toBe(true)
    expect(packageManager.version).toBeUndefined()
    expect(getPackageManagerFullVersion).not.toHaveBeenCalled()
  })
})

test('skips the version query without a supported CI platform', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_ID_TOKEN: 'mock-id-token' }

    const packageManager = await inspectVersionedPackageManager(context)

    expect(packageManager.isYarnBerry).toBe(true)
    expect(packageManager.version).toBeUndefined()
    expect(getPackageManagerFullVersion).not.toHaveBeenCalled()
  })
})

test('skips the version query for yarn classic', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_ID_TOKEN: 'mock-id-token', GITHUB_ACTIONS: 'true' }

    getPackageManagerVersion.mockResolvedValue(1)

    const packageManager = await inspectVersionedPackageManager(context)

    expect(packageManager.isYarnClassic).toBe(true)
    expect(packageManager.version).toBeUndefined()
    expect(getPackageManagerFullVersion).not.toHaveBeenCalled()
  })
})

test('skips the version query for npm and pnpm', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_ID_TOKEN: 'mock-id-token', GITHUB_ACTIONS: 'true' }

    for (const name of ['npm', 'pnpm'] as const) {
      resolvePackageManager.mockResolvedValue(name)

      const packageManager = await inspectVersionedPackageManager(context)

      expect(packageManager.name).toBe(name)
      expect(packageManager.version).toBeUndefined()
    }

    expect(getPackageManagerVersion).not.toHaveBeenCalled()
    expect(getPackageManagerFullVersion).not.toHaveBeenCalled()
  })
})

test('keeps the metadata without a version when the full version query fails', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_ID_TOKEN: 'mock-id-token', GITHUB_ACTIONS: 'true' }

    getPackageManagerFullVersion.mockResolvedValue(undefined)

    const packageManager = await inspectVersionedPackageManager(context)

    expect(packageManager.isYarnBerry).toBe(true)
    expect(packageManager.version).toBeUndefined()
  })
})

test('propagates the failure when the yarn version cannot be determined', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_ID_TOKEN: 'mock-id-token', GITHUB_ACTIONS: 'true' }

    getPackageManagerVersion.mockResolvedValue(null)

    await expect(inspectVersionedPackageManager(context)).rejects.toThrow(
      'The Yarn version could not be determined: run "yarn --version" to check the installation.'
    )
  })
})
