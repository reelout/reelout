// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { ReleasePlan } from '@reelout/core'
import { isCompleteReleasePlan, PLUGIN_NAME } from '@reelout/cargo'
import { expect, test } from 'vitest'

interface CreatePlanOptions {
  provider?: string | undefined
  name?: string | undefined
  private?: boolean | undefined
  releaseVersion: string | null
}

function createPlan(options: CreatePlanOptions): ReleasePlan {
  return {
    package: {
      provider: options.provider ?? PLUGIN_NAME,
      name: options.name,
      version: '1.2.2',
      private: options.private ?? false,
      root: false,
      entry: false,
      dependencies: [],
      location: 'crates/a',
    },
    history: [],
    release:
      options.releaseVersion == null
        ? null
        : { type: 'patch', version: options.releaseVersion },
  }
}

test('accepts a named, versioned, public cargo plan', () => {
  expect(
    isCompleteReleasePlan(createPlan({ name: 'a', releaseVersion: '1.2.3' }))
  ).toBe(true)
})

test('rejects plans from other providers', () => {
  expect(
    isCompleteReleasePlan(
      createPlan({
        name: 'a',
        releaseVersion: '1.2.3',
        provider: '@reelout/npm',
      })
    )
  ).toBe(false)
})

test('rejects private crates', () => {
  expect(
    isCompleteReleasePlan(
      createPlan({ name: 'a', releaseVersion: '1.2.3', private: true })
    )
  ).toBe(false)
})

test('rejects anonymous crates', () => {
  expect(
    isCompleteReleasePlan(
      createPlan({ name: undefined, releaseVersion: '1.2.3' })
    )
  ).toBe(false)
})

test('rejects plans without a release version', () => {
  expect(
    isCompleteReleasePlan(createPlan({ name: 'a', releaseVersion: null }))
  ).toBe(false)
})
