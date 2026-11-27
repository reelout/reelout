// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { isPublishOverRejection } from '@reelout/npm'
import { expect, test } from 'vitest'

test('matches conflict markers in non-error values', () => {
  expect(
    isPublishOverRejection(
      'npm error 409 cannot publish over the previously published versions'
    )
  ).toBe(true)
})

test('matches conflict markers in error objects', () => {
  expect(
    isPublishOverRejection(
      new Error(
        'npm error code EPUBLISHCONFLICT\nnpm error 403 cannot publish over the previously published version'
      )
    )
  ).toBe(true)
})

test('returns false for non-error values without conflict markers', () => {
  expect(isPublishOverRejection('network unreachable')).toBe(false)
})
