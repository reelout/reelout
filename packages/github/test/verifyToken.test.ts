// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { verifyToken } from '@reelout/github'
import { beforeEach, expect, test, vi } from 'vitest'
import { createMockRepository } from '../../../test/mock/context'

const getRepo = vi.hoisted(() => vi.fn())

const Octokit = vi.hoisted(() =>
  vi.fn(function () {
    return { rest: { repos: { get: getRepo } } }
  })
)

vi.mock('@octokit/rest', () => ({ Octokit }))

const repository = createMockRepository('github')

beforeEach(() => {
  vi.clearAllMocks()
})

test('resolves when GitHub accepts the token for the repository', async () => {
  getRepo.mockResolvedValueOnce({ data: { full_name: 'mock-owner/mock-repo' } })

  await expect(verifyToken('mock-token', repository)).resolves.toBeUndefined()

  expect(Octokit).toHaveBeenCalledWith(
    expect.objectContaining({ auth: 'mock-token' })
  )
  expect(getRepo).toHaveBeenCalledWith({
    owner: 'mock-owner',
    repo: 'mock-repo',
  })
})

test('throws a wrapped error when GitHub rejects the token', async () => {
  const rejection = Object.assign(new Error('Bad credentials'), {
    status: 401,
  })

  getRepo.mockRejectedValueOnce(rejection)

  const error = (await verifyToken('mock-token', repository).catch(
    (err) => err
  )) as Error

  expect(error).toMatchInlineSnapshot(
    '[Error: The GITHUB_TOKEN environment variable could not be verified.]'
  )
  expect(error.cause).toBe(rejection)
  expect(error.message).not.toContain('mock-token')
})
