// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { isPublishedCrateIdentical } from '@reelout/cargo'
import type { CompleteCargoReleasePlan } from '@reelout/cargo'
import { createHash } from 'node:crypto'
import { beforeEach, expect, test, vi } from 'vitest'
import { context } from '../../../test/mock/context'

const packLocalCrate = vi.hoisted(() => vi.fn())

vi.mock(import('@reelout/cargo/packLocalCrate'), () => ({
  packLocalCrate,
}))

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

const checksumOf = (content: string): string =>
  createHash('sha256').update(content).digest('hex')

beforeEach(() => {
  vi.resetAllMocks()
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
