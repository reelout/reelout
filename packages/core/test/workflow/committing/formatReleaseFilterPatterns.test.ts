// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { formatReleaseFilterPatterns } from '@reelout/core'
import { expect, test } from 'vitest'

test('joins filter patterns with commas', () => {
  expect(formatReleaseFilterPatterns(['pkg-a', '!pkg-b'])).toBe('pkg-a, !pkg-b')
})

test('escapes commas within filter patterns', () => {
  expect(formatReleaseFilterPatterns(['@scope/{cli,git}'])).toBe(
    '@scope/{cli\\,git}'
  )
})

test('returns an empty string for an empty pattern list', () => {
  expect(formatReleaseFilterPatterns([])).toBe('')
})
