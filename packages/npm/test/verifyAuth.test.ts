// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import '../../../test/mock/env'

import { verifyAuth, type PackageManagerInfo } from '@reelout/npm'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { temporaryDirectoryTask } from 'tempy'
import { beforeEach, expect, test, vi } from 'vitest'
import { context } from '../../../test/mock/context'

const execCommand = vi.hoisted(() => vi.fn())

const resolvePackageManager = vi.hoisted(() => vi.fn())

const getPackageManagerVersion = vi.hoisted(() => vi.fn())

vi.mock(import('@reelout/core/util/execCommand'), () => ({
  execCommand: (command, args, options) => execCommand(command, args, options),
}))

vi.mock(import('@reelout/npm/resolvePackageManager'), () => ({
  resolvePackageManager,
}))

vi.mock(import('@reelout/npm/getPackageManagerVersion'), () => ({
  getPackageManagerVersion,
}))

const NPMJS = 'https://registry.npmjs.org/'

const yarnBerry = (version?: string): PackageManagerInfo => ({
  name: 'yarn',
  isNpm: false,
  isPnpm: false,
  isYarn: true,
  isYarnClassic: false,
  isYarnBerry: true,
  ...(version === undefined ? {} : { version }),
})

beforeEach(() => {
  vi.resetAllMocks()
})

test('returns none when no registry authentication is configured', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = {}

    resolvePackageManager.mockResolvedValue('npm')

    expect(await verifyAuth(context)).toBe('none')

    expect(execCommand).not.toHaveBeenCalled()
  })
})

test('returns none when NPM_TOKEN contains only whitespace', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_TOKEN: '   ' }

    resolvePackageManager.mockResolvedValue('npm')

    expect(await verifyAuth(context)).toBe('none')

    expect(execCommand).not.toHaveBeenCalled()
  })
})

test('returns token and runs npm whoami against the publish registry when NPM_TOKEN is set', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_TOKEN: 'mock-npm-token' }

    resolvePackageManager.mockResolvedValue('npm')

    expect(await verifyAuth(context)).toBe('token')

    expect(execCommand.mock.calls).toEqual([
      [
        'npm',
        ['whoami', '--registry', NPMJS],
        {
          cwd,
          env: {
            NPM_TOKEN: 'mock-npm-token',
            'npm_config_//registry.npmjs.org/:_authToken': 'mock-npm-token',
          },
        },
      ],
    ])
  })
})

test('returns token and runs pnpm whoami against the publish registry when NPM_TOKEN is set', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_TOKEN: 'mock-npm-token' }

    resolvePackageManager.mockResolvedValue('pnpm')

    expect(await verifyAuth(context)).toBe('token')

    expect(execCommand.mock.calls).toEqual([
      [
        'pnpm',
        ['whoami', '--registry', NPMJS],
        {
          cwd,
          env: {
            NPM_TOKEN: 'mock-npm-token',
            'pnpm_config_//registry.npmjs.org/:_authToken': 'mock-npm-token',
          },
        },
      ],
    ])
  })
})

test('returns token and runs npm whoami when NPM_TOKEN is set and Yarn Classic is active', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_TOKEN: 'mock-npm-token' }

    resolvePackageManager.mockResolvedValue('yarn')
    getPackageManagerVersion.mockResolvedValue(1)

    expect(await verifyAuth(context)).toBe('token')

    expect(execCommand.mock.calls).toEqual([
      [
        'npm',
        ['whoami', '--registry', NPMJS],
        {
          cwd,
          env: {
            NPM_AUTH_TOKEN: 'mock-npm-token',
            NPM_TOKEN: 'mock-npm-token',
            'npm_config_//registry.npmjs.org/:_authToken': 'mock-npm-token',
          },
        },
      ],
    ])
  })
})

test('returns token and runs yarn npm whoami when NPM_TOKEN is set and Yarn Berry is active', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_TOKEN: 'mock-npm-token' }

    resolvePackageManager.mockResolvedValue('yarn')
    getPackageManagerVersion.mockResolvedValue(4)

    expect(await verifyAuth(context)).toBe('token')

    expect(execCommand.mock.calls).toEqual([
      [
        'yarn',
        ['npm', 'whoami', '--publish'],
        {
          cwd,
          env: {
            NPM_TOKEN: 'mock-npm-token',
            YARN_NPM_AUTH_TOKEN: 'mock-npm-token',
          },
        },
      ],
    ])
  })
})

test('returns token and verifies ambient .npmrc credentials without token injection', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = {}

    resolvePackageManager.mockResolvedValue('npm')

    await writeFile(
      path.join(cwd, '.npmrc'),
      '//registry.npmjs.org/:_authToken=mock-ambient-token'
    )

    expect(await verifyAuth(context)).toBe('token')

    expect(execCommand.mock.calls).toEqual([
      ['npm', ['whoami', '--registry', NPMJS], { cwd, env: {} }],
    ])
  })
})

test('returns token and verifies ambient Yarn Berry credentials without token injection', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = {}

    resolvePackageManager.mockResolvedValue('yarn')
    getPackageManagerVersion.mockResolvedValue(3)

    await writeFile(
      path.join(cwd, '.yarnrc.yml'),
      'npmAuthToken: mock-ambient-token\n'
    )

    expect(await verifyAuth(context)).toBe('token')

    expect(execCommand.mock.calls).toEqual([
      ['yarn', ['npm', 'whoami', '--publish'], { cwd, env: {} }],
    ])
  })
})

test('returns oidc without registry verification when NPM_ID_TOKEN is available', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_ID_TOKEN: 'mock-id-token' }

    expect(await verifyAuth(context)).toBe('oidc')

    expect(execCommand).not.toHaveBeenCalled()
  })
})

test('returns oidc without registry verification when GitHub Actions OIDC tokens are available', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = {
      ACTIONS_ID_TOKEN_REQUEST_URL: 'https://mock.url',
      ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'mock-request-token',
    }

    expect(await verifyAuth(context)).toBe('oidc')

    expect(execCommand).not.toHaveBeenCalled()
  })
})

test('returns oidc without registry verification when NPM_TOKEN and OIDC environment tokens are both available', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = {
      NPM_TOKEN: 'mock-npm-token',
      NPM_ID_TOKEN: 'mock-id-token',
    }

    expect(await verifyAuth(context)).toBe('oidc')

    expect(execCommand).not.toHaveBeenCalled()
  })
})

test('returns token when NPM_TOKEN is set and the OIDC identity token is whitespace-only', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_TOKEN: 'mock-npm-token', NPM_ID_TOKEN: '   ' }

    resolvePackageManager.mockResolvedValue('npm')

    expect(await verifyAuth(context)).toBe('token')

    expect(execCommand.mock.calls).toEqual([
      [
        'npm',
        ['whoami', '--registry', NPMJS],
        {
          cwd,
          env: {
            NPM_TOKEN: 'mock-npm-token',
            NPM_ID_TOKEN: '   ',
            'npm_config_//registry.npmjs.org/:_authToken': 'mock-npm-token',
          },
        },
      ],
    ])
  })
})

test('returns none when only OIDC environment tokens are available and Yarn is active', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_ID_TOKEN: 'mock-id-token' }

    resolvePackageManager.mockResolvedValue('yarn')
    getPackageManagerVersion.mockResolvedValue(4)

    expect(await verifyAuth(context)).toBe('none')

    expect(execCommand).not.toHaveBeenCalled()
  })
})

test('rejects when the whoami pre-flight check fails for NPM_TOKEN', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_TOKEN: 'mock-expired-token' }

    resolvePackageManager.mockResolvedValue('npm')

    const requestError = new Error('401 Unauthorized: invalid auth token')

    execCommand.mockRejectedValueOnce(requestError)

    const error: unknown = await verifyAuth(context).catch((err) => err)

    expect(error).toMatchInlineSnapshot(
      `[Error: NPM_TOKEN or ambient registry credentials are invalid or expired.]`
    )
    expect((error as Error).cause).toBe(requestError)
  })
})

test('rejects when the whoami pre-flight check fails for ambient credentials', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = {}

    resolvePackageManager.mockResolvedValue('npm')

    await writeFile(
      path.join(cwd, '.npmrc'),
      '//registry.npmjs.org/:_authToken=mock-ambient-token'
    )

    const requestError = new Error('401 Unauthorized: invalid auth token')

    execCommand.mockRejectedValueOnce(requestError)

    const error: unknown = await verifyAuth(context).catch((err) => err)

    expect(error).toMatchInlineSnapshot(
      `[Error: NPM_TOKEN or ambient registry credentials are invalid or expired.]`
    )
    expect((error as Error).cause).toBe(requestError)
  })
})

test('rejects with the registry url when the whoami pre-flight check cannot reach the registry', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_TOKEN: 'mock-npm-token' }

    resolvePackageManager.mockResolvedValue('npm')

    const networkError = new Error('getaddrinfo ENOTFOUND registry.npmjs.org')

    execCommand.mockRejectedValueOnce(networkError)

    const error: unknown = await verifyAuth(context).catch((err) => err)

    expect(error).toMatchInlineSnapshot(
      `[Error: The publish registry "https://registry.npmjs.org/" could not be reached to verify credentials.]`
    )
    expect((error as Error).cause).toBe(networkError)
  })
})

test('verifies existing ambient credentials without injection when NPM_TOKEN is also set', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_TOKEN: 'mock-npm-token' }

    resolvePackageManager.mockResolvedValue('npm')

    await writeFile(
      path.join(cwd, '.npmrc'),
      '//registry.npmjs.org/:_authToken=mock-ambient-token'
    )

    expect(await verifyAuth(context)).toBe('token')

    expect(execCommand.mock.calls).toEqual([
      [
        'npm',
        ['whoami', '--registry', NPMJS],
        { cwd, env: { NPM_TOKEN: 'mock-npm-token' } },
      ],
    ])
  })
})

test('returns oidc when Yarn Berry publishes with OIDC trusted publishing on GitHub Actions', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_ID_TOKEN: 'mock-id-token', GITHUB_ACTIONS: 'true' }

    expect(await verifyAuth(context, yarnBerry('4.3.0'))).toBe('oidc')

    expect(execCommand).not.toHaveBeenCalled()
  })
})

test('returns oidc when Yarn Berry publishes with OIDC trusted publishing on CircleCI', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_ID_TOKEN: 'mock-id-token', CIRCLECI: 'true' }

    expect(await verifyAuth(context, yarnBerry('4.4.2'))).toBe('oidc')

    expect(execCommand).not.toHaveBeenCalled()
  })
})

test('returns none when Yarn Berry predates the CircleCI OIDC gate', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_ID_TOKEN: 'mock-id-token', CIRCLECI: 'true' }

    expect(await verifyAuth(context, yarnBerry('4.3.0'))).toBe('none')

    expect(execCommand).not.toHaveBeenCalled()
  })
})

test('returns token when Yarn Berry registry credentials take precedence over OIDC tokens', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_ID_TOKEN: 'mock-id-token', GITHUB_ACTIONS: 'true' }

    await writeFile(
      path.join(cwd, '.yarnrc.yml'),
      'npmAuthToken: mock-ambient-token\n'
    )

    expect(await verifyAuth(context, yarnBerry('4.3.0'))).toBe('token')

    expect(execCommand.mock.calls).toEqual([
      [
        'yarn',
        ['npm', 'whoami', '--publish'],
        {
          cwd,
          env: { NPM_ID_TOKEN: 'mock-id-token', GITHUB_ACTIONS: 'true' },
        },
      ],
    ])
  })
})

test('returns none when Yarn Berry OIDC tokens lack a supported CI platform', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_ID_TOKEN: 'mock-id-token' }

    expect(await verifyAuth(context, yarnBerry('4.3.0'))).toBe('none')

    expect(execCommand).not.toHaveBeenCalled()
  })
})

test('returns none when the Yarn Berry release predates OIDC trusted publishing', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_ID_TOKEN: 'mock-id-token', GITHUB_ACTIONS: 'true' }

    expect(await verifyAuth(context, yarnBerry('4.2.0'))).toBe('none')

    expect(execCommand).not.toHaveBeenCalled()
  })
})

test('returns none when the Yarn Berry version is unknown', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_ID_TOKEN: 'mock-id-token', GITHUB_ACTIONS: 'true' }

    expect(await verifyAuth(context, yarnBerry())).toBe('none')

    expect(execCommand).not.toHaveBeenCalled()
  })
})
