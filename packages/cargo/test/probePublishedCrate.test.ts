// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { SparseIndexClient } from '@reelout/cargo'
import { probePublishedCrate } from '@reelout/cargo'
import { beforeEach, expect, test, vi } from 'vitest'

const getRecords = vi.fn()

const reload = vi.fn()

const index: SparseIndexClient = { getRecords, reload }

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
