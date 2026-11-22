// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { isPublishOverRejection } from '@reelout/cargo'
import { expect, test } from 'vitest'

test('matches the crates.io publish-over conflict wording', () => {
  expect(
    isPublishOverRejection(
      new Error(
        "Command 'cargo publish -p foo' failed (exit code 101)\n" +
          'error: failed to publish to registry at https://crates.io\n\n' +
          'Caused by:\n' +
          '  the remote server responded with an error (status 400 Bad Request): ' +
          'crate version `0.1.0` is already uploaded'
      )
    )
  ).toBe(true)
})

test('matches the "already exists" conflict phrasing case-insensitively', () => {
  expect(
    isPublishOverRejection('error: crate version 1.2.3 Already Exists')
  ).toBe(true)
})

test('returns false for errors without conflict markers', () => {
  expect(isPublishOverRejection(new Error('network unreachable'))).toBe(false)
})

test('returns false for non-error values without conflict markers', () => {
  expect(isPublishOverRejection('network unreachable')).toBe(false)
})
