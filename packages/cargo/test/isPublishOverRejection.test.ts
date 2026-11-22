// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { isPublishOverRejection } from '@reelout/cargo'
import { expect, test } from 'vitest'

test('matches the crates.io publish-over conflict wording', () => {
  expect(
    isPublishOverRejection(new Error('crate version `1.2.3` already exists'))
  ).toBe(true)
})

test('matches conflict markers case-insensitively in non-error values', () => {
  expect(
    isPublishOverRejection(
      'error: the remote server responded: crate version 1.2.3 Already Exists'
    )
  ).toBe(true)
})

test('returns false for errors without conflict markers', () => {
  expect(isPublishOverRejection(new Error('network unreachable'))).toBe(false)
})

test('returns false for non-error values without conflict markers', () => {
  expect(isPublishOverRejection('network unreachable')).toBe(false)
})
