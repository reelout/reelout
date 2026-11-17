// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { GitRepository } from '@reelout/core'
import { isSameRepository } from '@reelout/npm'
import { expect, test } from 'vitest'

function createRepository(
  overrides: Partial<GitRepository> = {}
): GitRepository {
  return {
    host: 'github',
    owner: 'reelout',
    repo: 'reelout',
    url: 'https://github.com/reelout/reelout',
    ...overrides,
  }
}

test('returns true for repositories with identical host, owner, and repo', () => {
  expect(isSameRepository(createRepository(), createRepository())).toBe(true)
})

test('returns true when only the URL differs', () => {
  expect(
    isSameRepository(
      createRepository(),
      createRepository({ url: 'https://example.com/reelout' })
    )
  ).toBe(true)
})

test('returns false when host, owner, or repo differ', () => {
  expect(
    isSameRepository(createRepository(), createRepository({ host: 'gitlab' }))
  ).toBe(false)
  expect(
    isSameRepository(createRepository(), createRepository({ owner: 'other' }))
  ).toBe(false)
  expect(
    isSameRepository(createRepository(), createRepository({ repo: 'other' }))
  ).toBe(false)
})
