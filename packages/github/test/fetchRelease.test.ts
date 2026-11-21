// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { Octokit } from '@octokit/rest'
import { fetchRelease } from '@reelout/github'
import { beforeEach, expect, test, vi } from 'vitest'
import { createMockRepository } from '../../../test/mock/context'

const getReleaseByTag = vi.hoisted(() => vi.fn())

const octokit = {
  rest: { repos: { getReleaseByTag } },
} as unknown as Octokit

beforeEach(() => {
  vi.clearAllMocks()
})

test('captures the id, name, and body of the release for the tag', async () => {
  getReleaseByTag.mockResolvedValueOnce({
    data: { id: 42, name: 'Old release name', body: 'Old release body' },
  })

  await expect(
    fetchRelease(octokit, createMockRepository('github'), 'v1.2.3')
  ).resolves.toEqual({
    id: 42,
    name: 'Old release name',
    body: 'Old release body',
  })

  expect(getReleaseByTag).toHaveBeenCalledWith({
    owner: 'mock-owner',
    repo: 'mock-repo',
    tag: 'v1.2.3',
  })
})

test('normalizes a missing release body to null', async () => {
  getReleaseByTag.mockResolvedValueOnce({
    data: { id: 42, name: 'Old release name', body: undefined },
  })

  await expect(
    fetchRelease(octokit, createMockRepository('github'), 'v1.2.3')
  ).resolves.toEqual({ id: 42, name: 'Old release name', body: null })
})

test('returns null when the tag has no release', async () => {
  getReleaseByTag.mockRejectedValueOnce(
    Object.assign(new Error('Not Found'), { status: 404 })
  )

  await expect(
    fetchRelease(octokit, createMockRepository('github'), 'v1.2.3')
  ).resolves.toBeNull()
})

test('rethrows API errors other than not-found', async () => {
  const rejection = Object.assign(new Error('Server Error'), { status: 500 })

  getReleaseByTag.mockRejectedValueOnce(rejection)

  await expect(
    fetchRelease(octokit, createMockRepository('github'), 'v1.2.3')
  ).rejects.toBe(rejection)
})
