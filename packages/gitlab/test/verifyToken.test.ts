// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { verifyToken } from '@reelout/gitlab'
import { beforeEach, expect, test, vi } from 'vitest'

const showCurrentUserMock = vi.hoisted(() => vi.fn())

const Gitlab = vi.hoisted(() =>
  vi.fn(function () {
    return { Users: { showCurrentUser: showCurrentUserMock } }
  })
)

vi.mock('@gitbeaker/rest', () => ({ Gitlab }))

beforeEach(() => {
  vi.clearAllMocks()
})

test('verifies the token against the current-user endpoint', async () => {
  showCurrentUserMock.mockResolvedValueOnce({ username: 'mock-user' })

  await verifyToken('mock-token')

  expect(Gitlab).toHaveBeenCalledTimes(1)
  expect(Gitlab).toHaveBeenCalledWith(
    expect.objectContaining({ token: 'mock-token' })
  )
  expect(showCurrentUserMock).toHaveBeenCalledTimes(1)
})

test('wraps current-user request failures with the verification error', async () => {
  const requestError = new Error('401 Unauthorized')

  showCurrentUserMock.mockRejectedValueOnce(requestError)

  const error: unknown = await verifyToken('mock-token').catch((err) => err)

  expect(error).toMatchInlineSnapshot(
    `[Error: The GITLAB_TOKEN environment variable could not be verified.]`
  )
  expect((error as Error).cause).toBe(requestError)
})
