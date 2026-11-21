// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { verifyToken } from '@reelout/github'
import type { GitRepository } from '@reelout/core'
import { beforeEach, expect, test, vi } from 'vitest'

const get = vi.hoisted(() => vi.fn())

const Octokit = vi.hoisted(() =>
  vi.fn(function () {
    return { rest: { repos: { get } } }
  })
)

vi.mock('@octokit/rest', () => ({ Octokit }))

const repository: GitRepository = {
  host: 'github',
  owner: 'mock-owner',
  repo: 'mock-repo',
  url: 'https://github.com/mock-owner/mock-repo',
}

beforeEach(() => {
  vi.clearAllMocks()
})

test('resolves when GitHub accepts the token for the repository', async () => {
  get.mockResolvedValueOnce({ data: { full_name: 'mock-owner/mock-repo' } })

  await expect(verifyToken('mock-token', repository)).resolves.toBeUndefined()

  expect(Octokit).toHaveBeenCalledWith(
    expect.objectContaining({ auth: 'mock-token' })
  )
  expect(get).toHaveBeenCalledWith({
    owner: 'mock-owner',
    repo: 'mock-repo',
  })
})

test('throws a wrapped error when GitHub rejects the token', async () => {
  const rejection = Object.assign(new Error('Bad credentials'), {
    status: 401,
  })

  get.mockRejectedValueOnce(rejection)

  const error = (await verifyToken('mock-token', repository).catch(
    (err) => err
  )) as Error

  expect(error).toMatchInlineSnapshot(
    '[Error: The GITHUB_TOKEN environment variable could not be verified.]'
  )
  expect(error.cause).toBe(rejection)
  expect(error.message).not.toContain('mock-token')
})
