// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { verifyToken } from '@reelout/github'
import { beforeEach, expect, test, vi } from 'vitest'

const getAuthenticated = vi.hoisted(() => vi.fn())

const Octokit = vi.hoisted(() =>
  vi.fn(function () {
    return { rest: { users: { getAuthenticated } } }
  })
)

vi.mock('@octokit/rest', () => ({ Octokit }))

beforeEach(() => {
  vi.clearAllMocks()
})

test('resolves when GitHub accepts the token', async () => {
  getAuthenticated.mockResolvedValueOnce({ data: { login: 'mock-user' } })

  await expect(verifyToken('mock-token')).resolves.toBeUndefined()

  expect(Octokit).toHaveBeenCalledWith(
    expect.objectContaining({ auth: 'mock-token' })
  )
  expect(getAuthenticated).toHaveBeenCalledTimes(1)
})

test('throws a wrapped error when GitHub rejects the token', async () => {
  const rejection = Object.assign(new Error('Bad credentials'), {
    status: 401,
  })

  getAuthenticated.mockRejectedValueOnce(rejection)

  const error = (await verifyToken('mock-token').catch((err) => err)) as Error

  expect(error).toMatchInlineSnapshot(
    '[Error: The GITHUB_TOKEN environment variable could not be verified.]'
  )
  expect(error.cause).toBe(rejection)
  expect(error.message).not.toContain('mock-token')
})
