// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import {
  CARGO_REGISTRY_API,
  USER_AGENT,
  verifyPublishAccess,
  type CompleteReleasePlan,
  type SparseIndexClient,
} from '@reelout/cargo'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { context, logger } from '../../../test/mock/context'

const fetchMock = vi.hoisted(() => vi.fn())

const getRecords = vi.hoisted(() => vi.fn())

const index: SparseIndexClient = { getRecords, reload: vi.fn() }

function createPlan(name: string, version: string): CompleteReleasePlan {
  return {
    package: {
      provider: '@reelout/cargo',
      name,
      version: '1.2.2',
      private: false,
      root: true,
      entry: true,
      dependencies: [],
      location: '.',
    },
    history: [],
    release: { type: 'patch', version },
  }
}

const plan = createPlan('a', '1.2.3')

const verify = (plans: readonly CompleteReleasePlan[]) =>
  verifyPublishAccess(context, plans, {
    token: 'mock-token',
    login: 'mock-login',
    index,
  })

const ownersResponse = (users: unknown) =>
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({ users }),
  })

const warnCalls = (): string[] =>
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

test('allows new crates without an ownership check', async () => {
  getRecords.mockResolvedValue({ status: 'absent' })

  await verify([plan])

  expect(fetchMock).not.toHaveBeenCalled()
  expect(warnCalls()).toEqual([])
})

test('allows versions that are already published', async () => {
  getRecords.mockResolvedValue({
    status: 'found',
    records: [{ vers: '1.2.3', cksum: 'checksum-a', yanked: false }],
  })

  await verify([plan])

  expect(fetchMock).not.toHaveBeenCalled()
  expect(warnCalls()).toEqual([])
})

test('checks the owners of existing crates with a new version', async () => {
  getRecords.mockResolvedValue({
    status: 'found',
    records: [{ vers: '0.1.0', cksum: 'checksum-old', yanked: false }],
  })

  ownersResponse([
    { login: 'other-user', kind: 'user' },
    { login: 'mock-login', kind: 'user' },
  ])

  await verify([plan])

  expect(fetchMock.mock.calls[0]).toEqual([
    `${CARGO_REGISTRY_API}/crates/a/owners`,
    {
      headers: {
        Authorization: 'Bearer mock-token',
        'User-Agent': USER_AGENT,
      },
    },
  ])
  expect(warnCalls()).toEqual([])
})

test('warns and proceeds for team-owned crates', async () => {
  getRecords.mockResolvedValue({
    status: 'found',
    records: [{ vers: '0.1.0', cksum: 'checksum-old', yanked: false }],
  })

  ownersResponse([{ login: 'github:mock-org/mock-team', kind: 'team' }])

  await verify([plan])

  expect(
    warnCalls().some((message) =>
      message.includes(
        'Publish access could not be verified for "a@1.2.3": publishing will proceed and fail if access is missing.'
      )
    )
  ).toBe(true)
})

test('denies crates without a matching owner', async () => {
  getRecords.mockResolvedValue({
    status: 'found',
    records: [{ vers: '0.1.0', cksum: 'checksum-old', yanked: false }],
  })

  ownersResponse([{ login: 'other-user', kind: 'user' }])

  await expect(verify([plan])).rejects.toThrow(
    'Crates will not be published: the authenticated registry user is not an owner of "a@1.2.3".'
  )
})

test('denies every crate together with a single error', async () => {
  getRecords.mockResolvedValue({
    status: 'found',
    records: [{ vers: '0.1.0', cksum: 'checksum-old', yanked: false }],
  })

  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ users: [{ login: 'other-user', kind: 'user' }] }),
  })

  await expect(verify([plan, createPlan('b', '2.0.0')])).rejects.toThrow(
    'Crates will not be published: the authenticated registry user is not an owner of "a@1.2.3", "b@2.0.0".'
  )
})

test('warns when the ownership endpoint responds with an error', async () => {
  getRecords.mockResolvedValue({
    status: 'found',
    records: [{ vers: '0.1.0', cksum: 'checksum-old', yanked: false }],
  })

  fetchMock.mockResolvedValueOnce({ ok: false, status: 500 })

  await verify([plan])

  expect(
    warnCalls().some((message) =>
      message.includes(
        'Publish access could not be verified for "a@1.2.3": publishing will proceed and fail if access is missing.'
      )
    )
  ).toBe(true)
})

test('warns when the ownership request fails', async () => {
  getRecords.mockResolvedValue({
    status: 'found',
    records: [{ vers: '0.1.0', cksum: 'checksum-old', yanked: false }],
  })

  fetchMock.mockRejectedValueOnce(new Error('mock network failure'))

  await verify([plan])

  expect(
    warnCalls().some((message) =>
      message.includes(
        'Publish access could not be verified for "a@1.2.3": publishing will proceed and fail if access is missing.'
      )
    )
  ).toBe(true)
})

test('warns when the ownership response cannot be parsed', async () => {
  getRecords.mockResolvedValue({
    status: 'found',
    records: [{ vers: '0.1.0', cksum: 'checksum-old', yanked: false }],
  })

  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({}),
  })

  await verify([plan])

  expect(
    warnCalls().some((message) =>
      message.includes(
        'Publish access could not be verified for "a@1.2.3": publishing will proceed and fail if access is missing.'
      )
    )
  ).toBe(true)
})

test('warns when the sparse index cannot be read', async () => {
  getRecords.mockRejectedValue(new Error('mock index failure'))

  await verify([plan])

  expect(
    warnCalls().some((message) =>
      message.includes(
        'Publish access could not be verified for "a@1.2.3": publishing will proceed and fail if access is missing.'
      )
    )
  ).toBe(true)
})

test('forwards the abort signal to the ownership check', async () => {
  const controller = new AbortController()

  context.signal = controller.signal

  getRecords.mockResolvedValue({
    status: 'found',
    records: [{ vers: '0.1.0', cksum: 'checksum-old', yanked: false }],
  })

  fetchMock.mockResolvedValueOnce({
    ok: false,
    status: 500,
  })

  await verify([plan])

  expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
    signal: controller.signal,
  })
})
