// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import '../../../../test/mock/env'

import { isGitHubActions } from '@reelout/core'
import { expect, test, vi } from 'vitest'

test('returns true when GITHUB_ACTIONS flag is enabled', () => {
  vi.stubEnv('GITHUB_ACTIONS', 'true')
  expect(isGitHubActions(process.env)).toBe(true)

  vi.stubEnv('GITHUB_ACTIONS', '1')
  expect(isGitHubActions(process.env)).toBe(true)
})

test('returns false when GITHUB_ACTIONS flag is disabled or absent', () => {
  vi.stubEnv('GITHUB_ACTIONS', 'false')
  expect(isGitHubActions(process.env)).toBe(false)

  vi.stubEnv('GITHUB_ACTIONS', '0')
  expect(isGitHubActions(process.env)).toBe(false)

  vi.stubEnv('GITHUB_ACTIONS', '')
  expect(isGitHubActions(process.env)).toBe(false)
})
