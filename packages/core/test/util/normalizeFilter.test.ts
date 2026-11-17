// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { normalizeFilter } from '@reelout/core'
import { expect, test } from 'vitest'

test('returns an empty list for undefined or empty inputs', () => {
  expect(normalizeFilter(undefined)).toEqual([])
  expect(normalizeFilter([])).toEqual([])
})

test('wraps a single pattern in a list', () => {
  expect(normalizeFilter('pkg-a')).toEqual(['pkg-a'])
  expect(normalizeFilter('!pkg-a')).toEqual(['**', '!pkg-a'])
})

test('passes through lists that already contain a positive pattern', () => {
  expect(normalizeFilter(['pkg-a'])).toEqual(['pkg-a'])
  expect(normalizeFilter(['pkg-*', '!pkg-skip'])).toEqual([
    'pkg-*',
    '!pkg-skip',
  ])
})

test('expands negation-only lists with a global wildcard', () => {
  expect(normalizeFilter(['!pkg-a'])).toEqual(['**', '!pkg-a'])
  expect(normalizeFilter(['!pkg-a', '!pkg-b'])).toEqual([
    '**',
    '!pkg-a',
    '!pkg-b',
  ])
})
