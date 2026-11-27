// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { isStageRequiredRejection } from '@reelout/npm'
import { expect, test } from 'vitest'

test('matches the stage-required error code in non-error values', () => {
  expect(
    isStageRequiredRejection(
      'npm error code E_STAGE_REQUIRED\nnpm error 403 direct publishing requires staged publishing'
    )
  ).toBe(true)
})

test('matches the stage-required error code in error objects', () => {
  expect(
    isStageRequiredRejection(
      new Error(
        'npm error code E_STAGE_REQUIRED\nnpm error 403 Forbidden - direct publishing is disabled for this package: use staged publishing'
      )
    )
  ).toBe(true)
})

test('returns false for non-error values without the stage-required error code', () => {
  expect(isStageRequiredRejection('network unreachable')).toBe(false)
})
