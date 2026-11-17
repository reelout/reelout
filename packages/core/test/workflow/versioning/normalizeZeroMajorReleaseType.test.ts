// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { normalizeZeroMajorReleaseType } from '@reelout/core'
import { expect, test } from 'vitest'

test('downgrades major to minor for zero-major versions', () => {
  expect(normalizeZeroMajorReleaseType('0.3.0', 'major')).toBe('minor')
  expect(normalizeZeroMajorReleaseType('0.3.1', 'major')).toBe('minor')
  expect(normalizeZeroMajorReleaseType('0.0.3', 'major')).toBe('minor')
  expect(normalizeZeroMajorReleaseType('0.3.0-alpha.1', 'major')).toBe('minor')
})

test('keeps major for versions at or above 1.0.0', () => {
  expect(normalizeZeroMajorReleaseType('1.0.0', 'major')).toBe('major')
  expect(normalizeZeroMajorReleaseType('1.2.3', 'major')).toBe('major')
  expect(normalizeZeroMajorReleaseType('2.0.0', 'major')).toBe('major')
  expect(normalizeZeroMajorReleaseType('1.0.0-alpha.1', 'major')).toBe('major')
})

test('preserves minor and patch release types', () => {
  expect(normalizeZeroMajorReleaseType('0.3.0', 'minor')).toBe('minor')
  expect(normalizeZeroMajorReleaseType('1.2.3', 'minor')).toBe('minor')
  expect(normalizeZeroMajorReleaseType('0.3.0', 'patch')).toBe('patch')
  expect(normalizeZeroMajorReleaseType('1.2.3', 'patch')).toBe('patch')
})

test('preserves null and undefined release types', () => {
  expect(normalizeZeroMajorReleaseType('0.3.0', null)).toBe(null)
  expect(normalizeZeroMajorReleaseType('0.3.0', undefined)).toBe(undefined)
})

test('keeps major when version is missing or invalid', () => {
  expect(normalizeZeroMajorReleaseType(undefined, 'major')).toBe('major')
  expect(normalizeZeroMajorReleaseType(null, 'major')).toBe('major')
  expect(normalizeZeroMajorReleaseType('not-a-version', 'major')).toBe('major')
})
