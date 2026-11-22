// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import {
  CARGO_REGISTRY_API,
  USER_AGENT,
  resolveCargoToken,
  verifyRegistryToken,
} from '@reelout/cargo'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { temporaryDirectoryTask } from 'tempy'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { context } from '../../../test/mock/context'

const fetchMock = vi.hoisted(() => vi.fn())

const writeCredentials = async (home: string, credentials: string) => {
  await mkdir(path.join(home, '.cargo'), { recursive: true })
  await writeFile(
    path.join(home, '.cargo', 'credentials.toml'),
    `${credentials}\n`
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('fetch', (...args: unknown[]) => fetchMock(...args))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

test('prefers the CARGO_REGISTRY_TOKEN environment variable', async () => {
  context.env = { CARGO_REGISTRY_TOKEN: '  mock-registry-token  ' }

  await expect(resolveCargoToken(context)).resolves.toBe('mock-registry-token')
})

test('falls back to the cargo credentials file', async () => {
  await temporaryDirectoryTask(async (home) => {
    context.env = { HOME: home }

    await writeCredentials(home, '[registry]\ntoken = "credentials-token"')

    await expect(resolveCargoToken(context)).resolves.toBe('credentials-token')
  })
})

test('returns undefined without credentials', async () => {
  await temporaryDirectoryTask(async (home) => {
    context.env = { HOME: home }

    await expect(resolveCargoToken(context)).resolves.toBe(undefined)
  })
})

test('returns undefined when the credentials file is invalid TOML', async () => {
  await temporaryDirectoryTask(async (home) => {
    context.env = { HOME: home }

    await writeCredentials(home, 'not = [valid')

    await expect(resolveCargoToken(context)).resolves.toBe(undefined)
  })
})

test('returns undefined for whitespace-only tokens', async () => {
  await temporaryDirectoryTask(async (home) => {
    context.env = { CARGO_REGISTRY_TOKEN: '   ', HOME: home }

    await writeCredentials(home, '[registry]\ntoken = "   "')

    await expect(resolveCargoToken(context)).resolves.toBe(undefined)
  })
})

test('returns undefined for non-string tokens', async () => {
  await temporaryDirectoryTask(async (home) => {
    context.env = { HOME: home }

    await writeCredentials(home, '[registry]\ntoken = 123')

    await expect(resolveCargoToken(context)).resolves.toBe(undefined)
  })
})

test('verifies the token and resolves the login', async () => {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({ user: { login: 'mock-login' } }),
  })

  await expect(
    verifyRegistryToken(context, 'mock-registry-token')
  ).resolves.toBe('mock-login')

  expect(fetchMock.mock.calls[0]).toEqual([
    `${CARGO_REGISTRY_API}/me`,
    {
      headers: {
        Authorization: 'Bearer mock-registry-token',
        'User-Agent': USER_AGENT,
      },
    },
  ])
})

test('wraps registry rejections', async () => {
  fetchMock.mockResolvedValueOnce({ ok: false, status: 401 })

  const error: unknown = await verifyRegistryToken(
    context,
    'mock-expired-token'
  ).catch((err) => err)

  expect(error).toMatchInlineSnapshot(
    `[Error: The CARGO_REGISTRY_TOKEN environment variable could not be verified.]`
  )
  expect((error as Error).cause).toMatchInlineSnapshot(
    `[Error: The registry responded with HTTP 401.]`
  )
})

test('wraps unparseable accounts', async () => {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({}),
  })

  const error: unknown = await verifyRegistryToken(
    context,
    'mock-registry-token'
  ).catch((err) => err)

  expect(error).toMatchInlineSnapshot(
    `[Error: The CARGO_REGISTRY_TOKEN environment variable could not be verified.]`
  )
  expect((error as Error).cause).toMatchInlineSnapshot(
    `[Error: The registry account could not be read.]`
  )
})

test('wraps request failures', async () => {
  const failure = new Error('mock network failure')

  fetchMock.mockRejectedValueOnce(failure)

  const error: unknown = await verifyRegistryToken(
    context,
    'mock-registry-token'
  ).catch((err) => err)

  expect(error).toMatchInlineSnapshot(
    `[Error: The CARGO_REGISTRY_TOKEN environment variable could not be verified.]`
  )
  expect((error as Error).cause).toBe(failure)
})

test('forwards the abort signal to the registry verification', async () => {
  const controller = new AbortController()

  context.signal = controller.signal

  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({ user: { login: 'mock-login' } }),
  })

  await verifyRegistryToken(context, 'mock-registry-token')

  expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
    signal: controller.signal,
  })
})
