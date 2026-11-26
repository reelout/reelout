// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import '../../../test/mock/env'

import type { ReleasePlan } from '@reelout/core'
import {
  PLUGIN_NAME,
  verifyTrustedPublishing,
  type PackageManagerInfo,
} from '@reelout/npm'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { temporaryDirectoryTask } from 'tempy'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { context, logger } from '../../../test/mock/context'

const fetchMock = vi.hoisted(() => vi.fn())

const getPackageManagerFullVersionMock = vi.hoisted(() => vi.fn())

vi.mock(import('@reelout/npm/getPackageManagerFullVersion'), () => ({
  getPackageManagerFullVersion: getPackageManagerFullVersionMock,
}))

const NPMJS = 'https://registry.npmjs.org/'

const createPackageManager = (
  name: 'npm' | 'pnpm' | 'yarn',
  isYarnBerry = false
): PackageManagerInfo => ({
  name,
  isNpm: name === 'npm',
  isPnpm: name === 'pnpm',
  isYarn: name === 'yarn',
  isYarnClassic: name === 'yarn' && !isYarnBerry,
  isYarnBerry: name === 'yarn' && isYarnBerry,
})

interface PlanOptions {
  name?: string | undefined
  version?: string | undefined
  isPrivate?: boolean | undefined
  provider?: string | undefined
  withoutRelease?: boolean | undefined
  location?: string | undefined
}

const createPlan = (options: PlanOptions = {}): ReleasePlan =>
  ({
    package: {
      provider: options.provider ?? PLUGIN_NAME,
      name: options.name,
      version: '1.2.2',
      private: options.isPrivate ?? false,
      root: false,
      entry: false,
      dependencies: [],
      location: options.location ?? '.',
    },
    history: [],
    release: options.withoutRelease
      ? null
      : { type: 'patch', version: options.version ?? '1.2.3' },
  }) as ReleasePlan

const exchangeEndpoint = (name: string): string =>
  `${NPMJS}-/npm/v1/oidc/token/exchange/package/${encodeURIComponent(name)}`

const mockExchange = (
  status = 200,
  body: unknown = { token: 'mock-publish-token' }
) =>
  fetchMock.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })

const mockIdentityToken = (token: string) =>
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({ value: token }),
  })

const infoMessages = (): string[] =>
  logger.mock.calls.flatMap(([message]) =>
    typeof message === 'string' ? [message] : []
  )

beforeEach(() => {
  vi.resetAllMocks()
  getPackageManagerFullVersionMock.mockResolvedValue('11.5.1')
  vi.stubGlobal('fetch', (...args: unknown[]) => fetchMock(...args))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

test('verifies trusted publishing when NPM_TOKEN is also configured', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = {
      NPM_TOKEN: 'mock-npm-token',
      NPM_ID_TOKEN: 'mock-id-token',
    }

    mockExchange()

    await verifyTrustedPublishing(
      context,
      [createPlan({ name: 'a' })],
      createPackageManager('npm')
    )

    expect(fetchMock.mock.calls).toEqual([
      [
        exchangeEndpoint('a'),
        {
          method: 'POST',
          headers: { authorization: 'Bearer mock-id-token' },
          signal: expect.any(AbortSignal),
        },
      ],
    ])

    expect(infoMessages()).toEqual([
      'Trusted publishing verified for "a@1.2.3".',
    ])
  })
})

test('returns an empty set when verification is skipped', async () => {
  context.env = { NPM_TOKEN: 'mock-npm-token' }

  const skipped = await verifyTrustedPublishing(
    context,
    [createPlan({ name: 'a' })],
    createPackageManager('npm')
  )

  expect(skipped.size).toBe(0)
})

test('returns the verified plans', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_ID_TOKEN: 'mock-id-token' }

    const first = createPlan({ name: 'a' })
    const second = createPlan({ name: 'b', version: '2.0.0' })

    mockExchange()
    mockExchange()

    const verified = await verifyTrustedPublishing(
      context,
      [first, second],
      createPackageManager('npm')
    )

    expect(verified.size).toBe(2)
    expect([...verified]).toEqual([first, second])
  })
})

test('skips verification when NPM_TOKEN is configured without OIDC tokens', async () => {
  context.env = { NPM_TOKEN: 'mock-npm-token' }

  await verifyTrustedPublishing(
    context,
    [createPlan({ name: 'a' })],
    createPackageManager('npm')
  )

  expect(fetchMock).not.toHaveBeenCalled()
  expect(logger.mock.calls).toEqual([])
})

test('skips verification without OIDC tokens', async () => {
  await verifyTrustedPublishing(
    context,
    [createPlan({ name: 'a' })],
    createPackageManager('npm')
  )

  expect(fetchMock).not.toHaveBeenCalled()
})

test('skips verification for yarn releases', async () => {
  context.env = { NPM_ID_TOKEN: 'mock-id-token' }

  for (const isYarnBerry of [false, true]) {
    await verifyTrustedPublishing(
      context,
      [createPlan({ name: 'a' })],
      createPackageManager('yarn', isYarnBerry)
    )
  }

  expect(fetchMock).not.toHaveBeenCalled()
})

test('verifies each package through the trusted-publishing token exchange', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_ID_TOKEN: 'mock-id-token' }

    mockExchange()
    mockExchange()

    await verifyTrustedPublishing(
      context,
      [
        createPlan({ name: 'a', version: '1.2.3' }),
        createPlan({ name: '@mock-scope/b', version: '2.0.0' }),
      ],
      createPackageManager('npm')
    )

    expect(fetchMock.mock.calls).toEqual([
      [
        exchangeEndpoint('a'),
        {
          method: 'POST',
          headers: { authorization: 'Bearer mock-id-token' },
          signal: expect.any(AbortSignal),
        },
      ],
      [
        exchangeEndpoint('@mock-scope/b'),
        {
          method: 'POST',
          headers: { authorization: 'Bearer mock-id-token' },
          signal: expect.any(AbortSignal),
        },
      ],
    ])

    expect(infoMessages()).toEqual([
      'Trusted publishing verified for "a@1.2.3", "@mock-scope/b@2.0.0".',
    ])
  })
})

test('requests the identity token from GitHub Actions with the npm audience', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = {
      ACTIONS_ID_TOKEN_REQUEST_URL: 'https://github-actions-token/',
      ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'mock-request-token',
    }

    mockIdentityToken('mock-id-token')
    mockExchange()

    await verifyTrustedPublishing(
      context,
      [createPlan({ name: 'a' })],
      createPackageManager('pnpm')
    )

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'https://github-actions-token/?audience=npm%3Aregistry.npmjs.org'
    )

    expect(fetchMock.mock.calls[0]?.[1]).toEqual({
      headers: { authorization: 'Bearer mock-request-token' },
      signal: expect.any(AbortSignal),
    })

    expect(fetchMock.mock.calls[1]).toEqual([
      exchangeEndpoint('a'),
      {
        method: 'POST',
        headers: { authorization: 'Bearer mock-id-token' },
        signal: expect.any(AbortSignal),
      },
    ])
  })
})

test('fails the release when the token exchange is rejected', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_ID_TOKEN: 'mock-id-token' }

    mockExchange(404, {
      message: 'package is not configured for trusted publishing',
    })

    await expect(
      verifyTrustedPublishing(
        context,
        [createPlan({ name: 'a', version: '1.2.3' })],
        createPackageManager('npm')
      )
    ).rejects.toThrow(
      'Trusted publishing could not be verified for "a@1.2.3" (HTTP 404: package is not configured for trusted publishing).'
    )
  })
})

test('fails the release when the exchange rejection carries no message', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_ID_TOKEN: 'mock-id-token' }

    mockExchange(500, {})

    await expect(
      verifyTrustedPublishing(
        context,
        [createPlan({ name: 'a', version: '1.2.3' })],
        createPackageManager('npm')
      )
    ).rejects.toThrow(
      'Trusted publishing could not be verified for "a@1.2.3" (HTTP 500).'
    )
  })
})

test('aggregates rejected exchanges across packages', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_ID_TOKEN: 'mock-id-token' }

    mockExchange(404, { message: 'not configured' })
    mockExchange(403, { message: 'workflow not allowed' })

    await expect(
      verifyTrustedPublishing(
        context,
        [
          createPlan({ name: 'a', version: '1.2.3' }),
          createPlan({ name: 'b', version: '2.0.0' }),
        ],
        createPackageManager('npm')
      )
    ).rejects.toThrow(
      'Trusted publishing could not be verified for "a@1.2.3" (HTTP 404: not configured), "b@2.0.0" (HTTP 403: workflow not allowed).'
    )
  })
})

test('fails the release when the package manager is too old for OIDC trusted publishing', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_ID_TOKEN: 'mock-id-token' }

    getPackageManagerFullVersionMock.mockResolvedValue('11.5.0')

    await expect(
      verifyTrustedPublishing(
        context,
        [createPlan({ name: 'a' })],
        createPackageManager('npm')
      )
    ).rejects.toThrow(
      'Trusted publishing requires npm >= 11.5.1, but "11.5.0" was found.'
    )

    expect(fetchMock).not.toHaveBeenCalled()
    expect(getPackageManagerFullVersionMock).toHaveBeenCalledWith(cwd, 'npm', {
      env: { NPM_ID_TOKEN: 'mock-id-token' },
      signal: undefined,
    })
  })
})

test('fails the release when the package manager version is unknown', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_ID_TOKEN: 'mock-id-token' }

    getPackageManagerFullVersionMock.mockResolvedValue(undefined)

    await expect(
      verifyTrustedPublishing(
        context,
        [createPlan({ name: 'a' })],
        createPackageManager('npm')
      )
    ).rejects.toThrow(
      'Trusted publishing requires npm >= 11.5.1, but "an unknown version" was found.'
    )

    expect(fetchMock).not.toHaveBeenCalled()
  })
})

test('fails the release when pnpm predates OIDC publishing support', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_ID_TOKEN: 'mock-id-token' }

    getPackageManagerFullVersionMock.mockResolvedValue('10.15.1')

    await expect(
      verifyTrustedPublishing(
        context,
        [createPlan({ name: 'a' })],
        createPackageManager('pnpm')
      )
    ).rejects.toThrow(
      'Trusted publishing requires pnpm >= 11.0.0, but "10.15.1" was found.'
    )

    expect(fetchMock).not.toHaveBeenCalled()
  })
})

test('skips verification when the NPM_ID_TOKEN contains only whitespace', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_ID_TOKEN: '   ' }

    await verifyTrustedPublishing(
      context,
      [createPlan({ name: 'a', version: '1.2.3' })],
      createPackageManager('npm')
    )

    expect(fetchMock).not.toHaveBeenCalled()
    expect(logger.mock.calls).toEqual([])
  })
})

test('skips verification when the GitHub Actions OIDC pair contains only whitespace', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = {
      ACTIONS_ID_TOKEN_REQUEST_URL: '  ',
      ACTIONS_ID_TOKEN_REQUEST_TOKEN: '   ',
    }

    await verifyTrustedPublishing(
      context,
      [createPlan({ name: 'a', version: '1.2.3' })],
      createPackageManager('npm')
    )

    expect(fetchMock).not.toHaveBeenCalled()
    expect(logger.mock.calls).toEqual([])
  })
})

test('falls back to the GitHub Actions identity token when NPM_ID_TOKEN contains only whitespace', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = {
      NPM_ID_TOKEN: '   ',
      ACTIONS_ID_TOKEN_REQUEST_URL: 'https://github-actions-token/',
      ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'mock-request-token',
    }

    mockIdentityToken('mock-id-token')
    mockExchange()

    await verifyTrustedPublishing(
      context,
      [createPlan({ name: 'a' })],
      createPackageManager('npm')
    )

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'https://github-actions-token/?audience=npm%3Aregistry.npmjs.org'
    )

    expect(fetchMock.mock.calls[1]).toEqual([
      exchangeEndpoint('a'),
      {
        method: 'POST',
        headers: { authorization: 'Bearer mock-id-token' },
        signal: expect.any(AbortSignal),
      },
    ])
  })
})

test('fails the release when the identity token request fails', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = {
      ACTIONS_ID_TOKEN_REQUEST_URL: 'https://github-actions-token/',
      ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'mock-request-token',
    }

    fetchMock.mockRejectedValueOnce(new Error('network down'))

    await expect(
      verifyTrustedPublishing(
        context,
        [createPlan({ name: 'a' })],
        createPackageManager('npm')
      )
    ).rejects.toThrow(
      'OIDC identity token could not be retrieved from GitHub Actions: network down'
    )
  })
})

test('fails the release when GitHub Actions rejects the identity token request', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = {
      ACTIONS_ID_TOKEN_REQUEST_URL: 'https://github-actions-token/',
      ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'mock-request-token',
    }

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
    })

    await expect(
      verifyTrustedPublishing(
        context,
        [createPlan({ name: 'a' })],
        createPackageManager('npm')
      )
    ).rejects.toThrow(
      'OIDC identity token could not be retrieved from GitHub Actions: HTTP 500.'
    )
  })
})

test('fails the release when the identity token response carries no token', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = {
      ACTIONS_ID_TOKEN_REQUEST_URL: 'https://github-actions-token/',
      ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'mock-request-token',
    }

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
    })

    await expect(
      verifyTrustedPublishing(
        context,
        [createPlan({ name: 'a' })],
        createPackageManager('npm')
      )
    ).rejects.toThrow(
      'OIDC identity token could not be retrieved from GitHub Actions: the response carries no identity token.'
    )
  })
})

test('skips packages that target another registry', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = {
      NPM_ID_TOKEN: 'mock-id-token',
      NPM_TOKEN: 'mock-npm-token',
    }

    await writeFile(
      path.join(cwd, 'package.json'),
      JSON.stringify({
        name: 'a',
        version: '1.2.3',
        publishConfig: { registry: 'https://npm.example.com/' },
      })
    )

    await verifyTrustedPublishing(
      context,
      [createPlan({ name: 'a' })],
      createPackageManager('npm')
    )

    expect(fetchMock).not.toHaveBeenCalled()
    expect(logger.mock.calls).toEqual([])
  })
})

test('fails the release when a package targets another registry without credentials', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_ID_TOKEN: 'mock-id-token' }

    await writeFile(
      path.join(cwd, 'package.json'),
      JSON.stringify({
        name: 'a',
        version: '1.2.3',
        publishConfig: { registry: 'https://npm.example.com/' },
      })
    )

    await expect(
      verifyTrustedPublishing(
        context,
        [createPlan({ name: 'a' })],
        createPackageManager('npm')
      )
    ).rejects.toThrow(
      'OIDC trusted publishing cannot authenticate "a@1.2.3" (https://npm.example.com/): it only supports the public npm registry and neither NPM_TOKEN nor ambient registry credentials were found.'
    )

    expect(fetchMock).not.toHaveBeenCalled()
  })
})

test('allows packages that target another registry through ambient credentials', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_ID_TOKEN: 'mock-id-token' }

    await writeFile(
      path.join(cwd, 'package.json'),
      JSON.stringify({
        name: 'a',
        version: '1.2.3',
        publishConfig: { registry: 'https://npm.example.com/' },
      })
    )

    await writeFile(
      path.join(cwd, '.npmrc'),
      '//npm.example.com/:_authToken=mock-ambient-token'
    )

    await verifyTrustedPublishing(
      context,
      [createPlan({ name: 'a' })],
      createPackageManager('npm')
    )

    expect(fetchMock).not.toHaveBeenCalled()
    expect(logger.mock.calls).toEqual([])
  })
})

test('verifies npm registry targets alongside packages that target another registry', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = {
      NPM_ID_TOKEN: 'mock-id-token',
      NPM_TOKEN: 'mock-npm-token',
    }

    await writeFile(
      path.join(cwd, 'package.json'),
      JSON.stringify({ name: 'a', version: '1.2.3' })
    )

    await mkdir(path.join(cwd, 'packages', 'b'), { recursive: true })

    await writeFile(
      path.join(cwd, 'packages', 'b', 'package.json'),
      JSON.stringify({
        name: 'b',
        version: '2.0.0',
        publishConfig: { registry: 'https://npm.example.com/' },
      })
    )

    mockExchange()

    await verifyTrustedPublishing(
      context,
      [
        createPlan({ name: 'a' }),
        createPlan({ name: 'b', version: '2.0.0', location: 'packages/b' }),
      ],
      createPackageManager('npm')
    )

    expect(fetchMock.mock.calls).toEqual([
      [
        exchangeEndpoint('a'),
        {
          method: 'POST',
          headers: { authorization: 'Bearer mock-id-token' },
          signal: expect.any(AbortSignal),
        },
      ],
    ])
  })
})

test('skips private, incomplete, and non-npm plans', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_ID_TOKEN: 'mock-id-token' }

    mockExchange()

    await verifyTrustedPublishing(
      context,
      [
        createPlan({ name: 'private-a', isPrivate: true }),
        createPlan({ name: 'unreleased-a', withoutRelease: true }),
        createPlan({ provider: 'other', name: 'foreign-a' }),
        createPlan(),
        createPlan({ name: 'a', version: '1.2.3' }),
      ],
      createPackageManager('npm')
    )

    expect(fetchMock.mock.calls).toEqual([
      [
        exchangeEndpoint('a'),
        {
          method: 'POST',
          headers: { authorization: 'Bearer mock-id-token' },
          signal: expect.any(AbortSignal),
        },
      ],
    ])
  })
})

test('forwards the abort signal to the identity token request and the exchange', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = {
      ACTIONS_ID_TOKEN_REQUEST_URL: 'https://github-actions-token/',
      ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'mock-request-token',
    }

    const controller = new AbortController()

    context.signal = controller.signal

    mockIdentityToken('mock-id-token')
    mockExchange()

    await verifyTrustedPublishing(
      context,
      [createPlan({ name: 'a' })],
      createPackageManager('npm')
    )

    const identityOptions = fetchMock.mock.calls[0]?.[1] as RequestInit

    const exchangeOptions = fetchMock.mock.calls[1]?.[1] as RequestInit

    expect(identityOptions.headers).toEqual({
      authorization: 'Bearer mock-request-token',
    })

    expect(exchangeOptions.method).toBe('POST')

    expect(exchangeOptions.headers).toEqual({
      authorization: 'Bearer mock-id-token',
    })

    expect(identityOptions.signal).toBeInstanceOf(AbortSignal)
    expect(exchangeOptions.signal).toBeInstanceOf(AbortSignal)
    expect(identityOptions.signal?.aborted).toBe(false)
    expect(exchangeOptions.signal?.aborted).toBe(false)

    controller.abort()

    expect(identityOptions.signal?.aborted).toBe(true)
    expect(exchangeOptions.signal?.aborted).toBe(true)
  })
})
