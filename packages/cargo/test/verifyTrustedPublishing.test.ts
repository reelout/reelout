// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import {
  CARGO_REGISTRY_API,
  USER_AGENT,
  hasTrustedPublishingAuth,
  verifyTrustedPublishing,
} from '@reelout/cargo'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { context, logger } from '../../../test/mock/context'

const fetchMock = vi.hoisted(() => vi.fn())

const exchangeEndpoint = `${CARGO_REGISTRY_API}/trusted_publishing/tokens`

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

test('exchanges the pre-issued identity token for a publish token', async () => {
  context.env = { CARGO_ID_TOKEN: 'mock-id-token' }

  mockExchange()

  await expect(verifyTrustedPublishing(context)).resolves.toBe(
    'mock-publish-token'
  )

  expect(fetchMock.mock.calls).toEqual([
    [
      exchangeEndpoint,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': USER_AGENT,
        },
        body: JSON.stringify({ jwt: 'mock-id-token' }),
      },
    ],
  ])

  expect(infoMessages()).toEqual([
    'Trusted publishing verified for this repository.',
  ])
})

test('trims the pre-issued identity token before the exchange', async () => {
  context.env = { CARGO_ID_TOKEN: '  mock-id-token \n' }

  mockExchange()

  await expect(verifyTrustedPublishing(context)).resolves.toBe(
    'mock-publish-token'
  )

  expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
    body: JSON.stringify({ jwt: 'mock-id-token' }),
  })
})

test('trims the identity token returned by GitHub Actions', async () => {
  context.env = {
    ACTIONS_ID_TOKEN_REQUEST_URL: 'https://github-actions-token/',
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'mock-request-token',
  }

  mockIdentityToken('  mock-id-token \n')

  mockExchange()

  await expect(verifyTrustedPublishing(context)).resolves.toBe(
    'mock-publish-token'
  )

  expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
    body: JSON.stringify({ jwt: 'mock-id-token' }),
  })
})

test('trims the publish token returned by the exchange', async () => {
  context.env = { CARGO_ID_TOKEN: 'mock-id-token' }

  mockExchange(200, { token: '  mock-publish-token \n' })

  await expect(verifyTrustedPublishing(context)).resolves.toBe(
    'mock-publish-token'
  )
})

test('rejects an identity token that is whitespace only', async () => {
  context.env = {
    ACTIONS_ID_TOKEN_REQUEST_URL: 'https://github-actions-token/',
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'mock-request-token',
  }

  mockIdentityToken('   ')

  const error: unknown = await verifyTrustedPublishing(context).catch(
    (err) => err
  )

  expect(error).toMatchInlineSnapshot(
    `[Error: OIDC identity token could not be retrieved from GitHub Actions: the response carries no identity token.]`
  )
})

test('rejects a publish token that is whitespace only', async () => {
  context.env = { CARGO_ID_TOKEN: 'mock-id-token' }

  mockExchange(200, { token: '   ' })

  const error: unknown = await verifyTrustedPublishing(context).catch(
    (err) => err
  )

  expect(error).toMatchInlineSnapshot(
    `[Error: Trusted publishing could not be verified: the response carries no publish token.]`
  )
})

test('requests the identity token from GitHub Actions with the crates.io audience', async () => {
  context.env = {
    ACTIONS_ID_TOKEN_REQUEST_URL: 'https://github-actions-token/',
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'mock-request-token',
  }

  mockIdentityToken('mock-id-token')

  mockExchange()

  await expect(verifyTrustedPublishing(context)).resolves.toBe(
    'mock-publish-token'
  )

  expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
    'https://github-actions-token/?audience=crates.io'
  )

  expect(fetchMock.mock.calls[0]?.[1]).toEqual({
    headers: { authorization: 'Bearer mock-request-token' },
  })

  expect(fetchMock.mock.calls[1]).toEqual([
    exchangeEndpoint,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
      },
      body: JSON.stringify({ jwt: 'mock-id-token' }),
    },
  ])
})

test('fails the release when no identity token source is configured', async () => {
  context.env = {}

  const error: unknown = await verifyTrustedPublishing(context).catch(
    (err) => err
  )

  expect(error).toMatchInlineSnapshot(
    `[Error: OIDC identity token is not available.]`
  )

  expect(fetchMock).not.toHaveBeenCalled()
})

test('fails the release when the identity token request fails', async () => {
  context.env = {
    ACTIONS_ID_TOKEN_REQUEST_URL: 'https://github-actions-token/',
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'mock-request-token',
  }

  fetchMock.mockRejectedValueOnce(new Error('network down'))

  const error: unknown = await verifyTrustedPublishing(context).catch(
    (err) => err
  )

  expect(error).toMatchInlineSnapshot(
    `[Error: OIDC identity token could not be retrieved from GitHub Actions: network down]`
  )
})

test('fails the release when GitHub Actions rejects the identity token request', async () => {
  context.env = {
    ACTIONS_ID_TOKEN_REQUEST_URL: 'https://github-actions-token/',
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'mock-request-token',
  }

  fetchMock.mockResolvedValueOnce({
    ok: false,
    status: 500,
    json: async () => ({}),
  })

  const error: unknown = await verifyTrustedPublishing(context).catch(
    (err) => err
  )

  expect(error).toMatchInlineSnapshot(
    `[Error: OIDC identity token could not be retrieved from GitHub Actions: HTTP 500.]`
  )
})

test('fails the release when the identity token response carries no token', async () => {
  context.env = {
    ACTIONS_ID_TOKEN_REQUEST_URL: 'https://github-actions-token/',
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'mock-request-token',
  }

  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({}),
  })

  const error: unknown = await verifyTrustedPublishing(context).catch(
    (err) => err
  )

  expect(error).toMatchInlineSnapshot(
    `[Error: OIDC identity token could not be retrieved from GitHub Actions: the response carries no identity token.]`
  )
})

test('fails the release when the identity token response is unparseable', async () => {
  context.env = {
    ACTIONS_ID_TOKEN_REQUEST_URL: 'https://github-actions-token/',
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'mock-request-token',
  }

  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => {
      throw new Error('unparseable body')
    },
  })

  const error: unknown = await verifyTrustedPublishing(context).catch(
    (err) => err
  )

  expect(error).toMatchInlineSnapshot(
    `[Error: OIDC identity token could not be retrieved from GitHub Actions: the response carries no identity token.]`
  )
})

test('fails the release when the token exchange is rejected', async () => {
  context.env = { CARGO_ID_TOKEN: 'mock-id-token' }

  mockExchange(404, {
    errors: [{ detail: 'crate is not configured for trusted publishing' }],
  })

  const error: unknown = await verifyTrustedPublishing(context).catch(
    (err) => err
  )

  expect(error).toMatchInlineSnapshot(
    `[Error: Trusted publishing could not be verified: HTTP 404: crate is not configured for trusted publishing]`
  )

  expect((error as Error).cause).toMatchInlineSnapshot(
    `[Error: HTTP 404: crate is not configured for trusted publishing]`
  )
})

test('fails the release when the exchange rejection carries no detail', async () => {
  context.env = { CARGO_ID_TOKEN: 'mock-id-token' }

  mockExchange(403, { errors: [{}] })

  const error: unknown = await verifyTrustedPublishing(context).catch(
    (err) => err
  )

  expect(error).toMatchInlineSnapshot(
    `[Error: Trusted publishing could not be verified: HTTP 403]`
  )
})

test('fails the release when the exchange rejection is unparseable', async () => {
  context.env = { CARGO_ID_TOKEN: 'mock-id-token' }

  fetchMock.mockResolvedValueOnce({
    ok: false,
    status: 502,
    json: async () => {
      throw new Error('unparseable body')
    },
  })

  const error: unknown = await verifyTrustedPublishing(context).catch(
    (err) => err
  )

  expect(error).toMatchInlineSnapshot(
    `[Error: Trusted publishing could not be verified: HTTP 502]`
  )
})

test('fails the release when the exchange response carries no publish token', async () => {
  context.env = { CARGO_ID_TOKEN: 'mock-id-token' }

  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => {
      throw new Error('unparseable body')
    },
  })

  const error: unknown = await verifyTrustedPublishing(context).catch(
    (err) => err
  )

  expect(error).toMatchInlineSnapshot(
    `[Error: Trusted publishing could not be verified: the response carries no publish token.]`
  )
})

test('fails the release when the exchange request fails', async () => {
  context.env = { CARGO_ID_TOKEN: 'mock-id-token' }

  const failure = new Error('network down')

  fetchMock.mockRejectedValueOnce(failure)

  const error: unknown = await verifyTrustedPublishing(context).catch(
    (err) => err
  )

  expect(error).toMatchInlineSnapshot(
    `[Error: Trusted publishing could not be verified: network down]`
  )

  expect((error as Error).cause).toBe(failure)
})

test('forwards the abort signal to the identity token request and the exchange', async () => {
  context.env = {
    ACTIONS_ID_TOKEN_REQUEST_URL: 'https://github-actions-token/',
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'mock-request-token',
  }

  const controller = new AbortController()

  context.signal = controller.signal

  mockIdentityToken('mock-id-token')

  mockExchange()

  await expect(verifyTrustedPublishing(context)).resolves.toBe(
    'mock-publish-token'
  )

  expect(fetchMock.mock.calls[0]?.[1]).toEqual({
    headers: { authorization: 'Bearer mock-request-token' },
    signal: controller.signal,
  })

  expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
    signal: controller.signal,
  })
})

test('detects trusted-publishing environment tokens', () => {
  expect(hasTrustedPublishingAuth({})).toBe(false)

  expect(hasTrustedPublishingAuth({ CARGO_ID_TOKEN: 'mock-id-token' })).toBe(
    true
  )

  expect(
    hasTrustedPublishingAuth({
      ACTIONS_ID_TOKEN_REQUEST_URL: 'https://github-actions-token/',
      ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'mock-request-token',
    })
  ).toBe(true)

  expect(
    hasTrustedPublishingAuth({
      ACTIONS_ID_TOKEN_REQUEST_URL: 'https://github-actions-token/',
    })
  ).toBe(false)
})
