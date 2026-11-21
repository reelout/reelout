// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { verifyToken } from '@reelout/gitlab'
import { beforeEach, expect, test, vi } from 'vitest'
import { createMockRepository } from '../../../test/mock/context'

const showProjectMock = vi.hoisted(() => vi.fn())

const Gitlab = vi.hoisted(() =>
  vi.fn(function () {
    return { Projects: { show: showProjectMock } }
  })
)

vi.mock('@gitbeaker/rest', () => ({ Gitlab }))

const repository = createMockRepository('gitlab')

beforeEach(() => {
  vi.clearAllMocks()
})

test('verifies the token against the release project', async () => {
  showProjectMock.mockResolvedValueOnce({
    path_with_namespace: 'mock-owner/mock-repo',
  })

  await verifyToken('mock-token', repository)

  expect(Gitlab).toHaveBeenCalledTimes(1)
  expect(Gitlab).toHaveBeenCalledWith(
    expect.objectContaining({ token: 'mock-token' })
  )
  expect(showProjectMock).toHaveBeenCalledWith('mock-owner%2Fmock-repo')
})

test('wraps project request failures with the verification error', async () => {
  const requestError = new Error('401 Unauthorized')

  showProjectMock.mockRejectedValueOnce(requestError)

  const error: unknown = await verifyToken('mock-token', repository).catch(
    (err) => err
  )

  expect(error).toMatchInlineSnapshot(
    `[Error: The GITLAB_TOKEN environment variable could not be verified.]`
  )
  expect((error as Error).cause).toBe(requestError)
})
