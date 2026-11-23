// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import {
  isPluginInactive,
  markPluginInactive,
  resetPluginActivity,
} from '@reelout/core'
import { expect, test } from 'vitest'
import { context } from '../../../../test/mock/context'

test('treats plugins as active until marked inactive', () => {
  resetPluginActivity(context)

  expect(isPluginInactive(context, 'plugin')).toBe(false)
})

test('marks plugins inactive for a release context', () => {
  resetPluginActivity(context)

  markPluginInactive(context, 'plugin')

  expect(isPluginInactive(context, 'plugin')).toBe(true)
  expect(isPluginInactive(context, 'other-plugin')).toBe(false)
})

test('resets plugin activity for a release context', () => {
  markPluginInactive(context, 'plugin')

  resetPluginActivity(context)

  expect(isPluginInactive(context, 'plugin')).toBe(false)
})
