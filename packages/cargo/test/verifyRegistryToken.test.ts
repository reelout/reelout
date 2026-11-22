// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import {
  CARGO_REGISTRY_API,
  USER_AGENT,
  verifyRegistryToken,
} from '@reelout/cargo'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { context } from '../../../test/mock/context'

const fetchMock = vi.hoisted(() => vi.fn())

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('fetch', (...args: unknown[]) => fetchMock(...args))
})

afterEach(() => {
  vi.unstubAllGlobals()
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
    `[Error: CARGO_REGISTRY_TOKEN or stored registry credentials could not be verified.]`
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
    `[Error: CARGO_REGISTRY_TOKEN or stored registry credentials could not be verified.]`
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
    `[Error: CARGO_REGISTRY_TOKEN or stored registry credentials could not be verified.]`
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
