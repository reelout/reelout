// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import '../../../test/mock/env'

import { resolveProvenance } from '@reelout/npm'
import { createConsola } from 'consola/core'
import { afterEach, expect, test, vi } from 'vitest'
import { context } from '../../../test/mock/context'

const resolveGitRepositoryFromPackage = vi.hoisted(() => vi.fn())

vi.mock(import('@reelout/npm/resolveGitRepositoryFromPackage'), () => ({
  resolveGitRepositoryFromPackage,
}))

afterEach(() => {
  vi.resetAllMocks()
})

test('returns the explicit provenance option unchanged', async () => {
  expect(await resolveProvenance(context, true)).toBe(true)

  expect(await resolveProvenance(context, false)).toBe(false)
})

test('logs a debug diagnostic when provenance detection fails', async () => {
  resolveGitRepositoryFromPackage.mockRejectedValueOnce(
    new Error('mock repository failure')
  )

  const debugLogger = vi.fn()

  context.logger = createConsola({ mockFn: () => debugLogger })

  expect(await resolveProvenance(context)).toBeUndefined()

  expect(debugLogger).toHaveBeenCalledWith(
    'Provenance could not be resolved from the package repository: mock repository failure'
  )
})
