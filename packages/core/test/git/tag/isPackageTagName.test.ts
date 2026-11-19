// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { isPackageTagName } from '@reelout/core'
import { expect, test } from 'vitest'

test('matches v-prefixed SemVer tags for entry packages', () => {
  expect(isPackageTagName(true, undefined, 'v1.0.0')).toBe(true)
  expect(isPackageTagName(true, undefined, 'v1.2.3-beta.1+sha.1234')).toBe(true)
})

test('rejects malformed tags for entry packages', () => {
  expect(isPackageTagName(true, undefined, 'v2-rc')).toBe(false)
  expect(isPackageTagName(true, undefined, 'pkg@1.0.0')).toBe(false)
  expect(isPackageTagName(true, undefined, '1.0.0')).toBe(false)
})

test('rejects v-prefixed workspace tags for entry packages', () => {
  expect(isPackageTagName(true, undefined, 'vfoo@1.0.0')).toBe(false)
})

test('matches scoped SemVer tags for named workspace packages', () => {
  expect(isPackageTagName(false, 'pkg', 'pkg@1.0.0')).toBe(true)
  expect(isPackageTagName(false, '@scope/pkg', '@scope/pkg@2.0.0-dev.1')).toBe(
    true
  )
})

test('rejects foreign or malformed tags for workspace packages', () => {
  expect(isPackageTagName(false, 'pkg', 'other@1.0.0')).toBe(false)
  expect(isPackageTagName(false, 'pkg', 'pkg@bad')).toBe(false)
  expect(isPackageTagName(false, 'pkg', 'v1.0.0')).toBe(false)
})

test('returns false for unnamed workspace packages', () => {
  expect(isPackageTagName(false, undefined, 'pkg@1.0.0')).toBe(false)
})
