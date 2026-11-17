// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { readReleaseFilterPatterns } from '@reelout/core'
import { expect, test } from 'vitest'
import { createMockCommit } from '../../../../../test/mock/git'

test('returns null when the commit is null or undefined', () => {
  expect(readReleaseFilterPatterns(null)).toBe(null)

  expect(readReleaseFilterPatterns(undefined)).toBe(null)
})

test('returns null when the commit carries no release filter trailer', async () => {
  expect(
    readReleaseFilterPatterns(
      await createMockCommit('a1b2c3d', 'feat: add entry')
    )
  ).toBe(null)
})

test('reads a single filter pattern from the release filter trailer', async () => {
  expect(
    readReleaseFilterPatterns(
      await createMockCommit(
        'a1b2c3d',
        'chore: release pkg-a',
        'Release-Filter: pkg-a'
      )
    )
  ).toEqual(['pkg-a'])
})

test('splits comma-separated patterns and trims whitespace', async () => {
  expect(
    readReleaseFilterPatterns(
      await createMockCommit(
        'a1b2c3d',
        'chore: release pkg-a',
        'Release-Filter: pkg-a, !pkg-b , @scope/pkg-*'
      )
    )
  ).toEqual(['pkg-a', '!pkg-b', '@scope/pkg-*'])
})

test('returns an empty list when the release filter trailer has an empty value', async () => {
  expect(
    readReleaseFilterPatterns(
      await createMockCommit(
        'a1b2c3d',
        'chore: release pkg-a',
        'Release-Filter:'
      )
    )
  ).toEqual([])
})
