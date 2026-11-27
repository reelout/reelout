// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { ReleasePlan } from '@reelout/core'
import {
  probeCrateReleasePlan,
  type CompleteReleasePlan,
  type SparseIndexClient,
} from '@reelout/cargo'
import { createHash } from 'node:crypto'
import { beforeEach, expect, test, vi } from 'vitest'
import { context, logger } from '../../../test/mock/context'

const packLocalCrate = vi.hoisted(() => vi.fn())

vi.mock(import('@reelout/cargo/packLocalCrate'), () => ({
  packLocalCrate,
}))

const getRecords = vi.fn()

const reload = vi.fn()

const index: SparseIndexClient = { getRecords, reload }

const plan: CompleteReleasePlan = {
  package: {
    provider: '@reelout/cargo',
    name: 'a',
    version: '1.2.2',
    private: false,
    root: true,
    entry: true,
    dependencies: [],
    location: '.',
  },
  history: [],
  release: { type: 'patch', version: '1.2.3' },
}

const warnCalls = (): string[] =>
  logger.mock.calls.flatMap(([message]) =>
    typeof message === 'string' ? [message] : []
  )

const checksumOf = (content: string): string =>
  createHash('sha256').update(content).digest('hex')

beforeEach(() => {
  vi.resetAllMocks()
})

test('skips plans whose version is already published with identical content', async () => {
  getRecords.mockResolvedValue({
    status: 'found',
    records: [
      { vers: '1.2.3', cksum: checksumOf('packed-crate'), yanked: false },
    ],
  })
  packLocalCrate.mockResolvedValue(Buffer.from('packed-crate'))

  const skipped = new Set<ReleasePlan>()

  await probeCrateReleasePlan(context, plan, index, skipped)

  expect(skipped.has(plan)).toBe(true)
  expect(
    warnCalls().some((message) =>
      message.includes(
        'Skipping publish of "a@1.2.3": already published with identical content.'
      )
    )
  ).toBe(true)
})

test('rejects plans whose published content cannot be verified as identical', async () => {
  getRecords.mockResolvedValue({
    status: 'found',
    records: [
      { vers: '1.2.3', cksum: checksumOf('other-crate'), yanked: false },
    ],
  })
  packLocalCrate.mockResolvedValue(Buffer.from('packed-crate'))

  const skipped = new Set<ReleasePlan>()

  await expect(
    probeCrateReleasePlan(context, plan, index, skipped)
  ).rejects.toThrow(
    'Version "a@1.2.3" was not published: the registry already has this version and its content could not be verified as identical.'
  )

  expect(skipped.has(plan)).toBe(false)
})

test('rejects plans whose published version is yanked', async () => {
  getRecords.mockResolvedValue({
    status: 'found',
    records: [
      { vers: '1.2.3', cksum: checksumOf('packed-crate'), yanked: true },
    ],
  })
  packLocalCrate.mockResolvedValue(Buffer.from('packed-crate'))

  const skipped = new Set<ReleasePlan>()

  await expect(
    probeCrateReleasePlan(context, plan, index, skipped)
  ).rejects.toThrow(
    'Version "a@1.2.3" was not published: the registry already has this version and it is yanked. Un-yank it and retry the release.'
  )

  expect(skipped.has(plan)).toBe(false)
  expect(packLocalCrate).not.toHaveBeenCalled()
})

test('returns without verifying when the version is absent from the registry', async () => {
  getRecords.mockResolvedValue({ status: 'absent' })

  const skipped = new Set<ReleasePlan>()

  await probeCrateReleasePlan(context, plan, index, skipped)

  expect(skipped.has(plan)).toBe(false)
  expect(packLocalCrate).not.toHaveBeenCalled()
  expect(warnCalls()).toEqual([])
})
