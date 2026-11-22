// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { ReleasePlan } from '@reelout/core'
import {
  isPublishedCrateIdentical,
  probeCrateReleasePlan,
  probePublishedCrate,
  type CompleteCargoReleasePlan,
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

const plan: CompleteCargoReleasePlan = {
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

test('reports published versions with their checksum', async () => {
  getRecords.mockResolvedValue({
    status: 'found',
    records: [
      { vers: '1.2.2', cksum: 'checksum-old', yanked: false },
      { vers: '1.2.3', cksum: 'checksum-new', yanked: false },
    ],
  })

  await expect(probePublishedCrate('a', '1.2.3', { index })).resolves.toEqual({
    status: 'published',
    cksum: 'checksum-new',
  })

  expect(getRecords).toHaveBeenCalledWith('a')
})

test('reports absent versions', async () => {
  getRecords.mockResolvedValue({
    status: 'found',
    records: [{ vers: '1.2.2', cksum: 'checksum-old', yanked: false }],
  })

  await expect(probePublishedCrate('a', '1.2.3', { index })).resolves.toEqual({
    status: 'absent',
  })
})

test('reports absent crates', async () => {
  getRecords.mockResolvedValue({ status: 'absent' })

  await expect(probePublishedCrate('a', '1.2.3', { index })).resolves.toEqual({
    status: 'absent',
  })
})

test('bypasses the cache for fresh probes', async () => {
  reload.mockResolvedValue({ status: 'absent' })

  await expect(
    probePublishedCrate('a', '1.2.3', { index, fresh: true })
  ).resolves.toEqual({ status: 'absent' })

  expect(reload).toHaveBeenCalledWith('a')
  expect(getRecords).not.toHaveBeenCalled()
})

test('proves identical content by packing the local crate', async () => {
  packLocalCrate.mockResolvedValue(Buffer.from('packed-crate'))

  await expect(
    isPublishedCrateIdentical(context, plan, checksumOf('packed-crate'))
  ).resolves.toBe(true)

  expect(packLocalCrate).toHaveBeenCalledWith(context, plan)
})

test('reports mismatching content', async () => {
  packLocalCrate.mockResolvedValue(Buffer.from('packed-crate'))

  await expect(
    isPublishedCrateIdentical(context, plan, checksumOf('other-crate'))
  ).resolves.toBe(false)
})

test('reports mismatching content when the local crate cannot be packed', async () => {
  packLocalCrate.mockRejectedValue(new Error('mock pack failure'))

  await expect(
    isPublishedCrateIdentical(context, plan, checksumOf('packed-crate'))
  ).resolves.toBe(false)
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

test('leaves absent versions to the publish', async () => {
  getRecords.mockResolvedValue({ status: 'absent' })

  const skipped = new Set<ReleasePlan>()

  await probeCrateReleasePlan(context, plan, index, skipped)

  expect(skipped.has(plan)).toBe(false)
  expect(packLocalCrate).not.toHaveBeenCalled()
  expect(warnCalls()).toEqual([])
})
