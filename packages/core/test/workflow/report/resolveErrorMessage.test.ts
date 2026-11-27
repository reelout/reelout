// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { ReleaseOutcome } from '@reelout/core'
import {
  resolveErrorMessage,
  resolveOutcomeErrorMessage,
} from '@reelout/core/workflow/report/resolveErrorMessage'
import { expect, test } from 'vitest'

function getFailureOutcome(error: unknown): ReleaseOutcome {
  return { status: 'failure', error, phase: null }
}

test('normalizes Error instances to their message', () => {
  expect(resolveErrorMessage(new Error('command failed'))).toBe(
    'command failed'
  )
})

test('passes string errors through unchanged', () => {
  expect(resolveErrorMessage('raw failure')).toBe('raw failure')
})

test('returns null for error values without a displayable message', () => {
  expect(resolveErrorMessage(undefined)).toBe(null)
  expect(resolveErrorMessage(null)).toBe(null)
  expect(resolveErrorMessage(42)).toBe(null)
  expect(resolveErrorMessage({ message: 'not an Error' })).toBe(null)
})

test('resolves the outcome error message when the error is displayable', () => {
  expect(resolveOutcomeErrorMessage(getFailureOutcome(new Error('boom')))).toBe(
    'boom'
  )
  expect(resolveOutcomeErrorMessage(getFailureOutcome('raw failure'))).toBe(
    'raw failure'
  )
})

test('falls back to the generic message when the outcome error has no displayable content', () => {
  expect(resolveOutcomeErrorMessage(getFailureOutcome(undefined))).toBe(
    'An unexpected error occurred during the release process.'
  )
  expect(resolveOutcomeErrorMessage(getFailureOutcome(42))).toBe(
    'An unexpected error occurred during the release process.'
  )
  expect(resolveOutcomeErrorMessage(getFailureOutcome(''))).toBe(
    'An unexpected error occurred during the release process.'
  )
})
