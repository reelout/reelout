// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import '../../../test/mock/env'

import type { ReleasePlan } from '@reelout/core'
import {
  PLUGIN_NAME,
  verifyTrustedPublishing,
  type PackageManagerInfo,
} from '@reelout/npm'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { temporaryDirectoryTask } from 'tempy'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { context, logger } from '../../../test/mock/context'

const fetchMock = vi.hoisted(() => vi.fn())

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
      location: '.',
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
  vi.stubGlobal('fetch', (...args: unknown[]) => fetchMock(...args))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

test('skips verification when NPM_TOKEN is configured', async () => {
  context.env = { NPM_TOKEN: 'mock-npm-token', NPM_ID_TOKEN: 'mock-id-token' }

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
        },
      ],
      [
        exchangeEndpoint('@mock-scope/b'),
        {
          method: 'POST',
          headers: { authorization: 'Bearer mock-id-token' },
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
    })

    expect(fetchMock.mock.calls[1]).toEqual([
      exchangeEndpoint('a'),
      {
        method: 'POST',
        headers: { authorization: 'Bearer mock-id-token' },
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

test('fails the release when no usable identity token source exists', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_ID_TOKEN: '   ' }

    await expect(
      verifyTrustedPublishing(
        context,
        [createPlan({ name: 'a', version: '1.2.3' })],
        createPackageManager('npm')
      )
    ).rejects.toThrow('OIDC identity token is not available.')
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
    context.env = { NPM_ID_TOKEN: 'mock-id-token' }

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

    expect(fetchMock.mock.calls[0]?.[1]).toEqual({
      headers: { authorization: 'Bearer mock-request-token' },
      signal: controller.signal,
    })

    expect(fetchMock.mock.calls[1]?.[1]).toEqual({
      method: 'POST',
      headers: { authorization: 'Bearer mock-id-token' },
      signal: controller.signal,
    })
  })
})
