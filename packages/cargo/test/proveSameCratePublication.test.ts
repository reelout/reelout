// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { proveSameCratePublication } from '@reelout/cargo'
import type { CompleteReleasePlan } from '@reelout/cargo'
import { createHash } from 'node:crypto'
import { beforeEach, expect, test, vi } from 'vitest'
import { context } from '../../../test/mock/context'

const packLocalCrate = vi.hoisted(() => vi.fn())

vi.mock(import('@reelout/cargo/packLocalCrate'), () => ({
  packLocalCrate,
}))

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

const checksumOf = (content: string): string =>
  createHash('sha256').update(content).digest('hex')

beforeEach(() => {
  vi.resetAllMocks()
})

test('proves identical content by packing the local crate', async () => {
  packLocalCrate.mockResolvedValue(Buffer.from('packed-crate'))

  await expect(
    proveSameCratePublication(context, plan, checksumOf('packed-crate'))
  ).resolves.toBe(true)

  expect(packLocalCrate).toHaveBeenCalledWith(context, plan)
})

test('reports differing crate content as unverified', async () => {
  packLocalCrate.mockResolvedValue(Buffer.from('packed-crate'))

  await expect(
    proveSameCratePublication(context, plan, checksumOf('other-crate'))
  ).resolves.toBe(false)
})

test('reports the publication as unverified when the local crate cannot be packed', async () => {
  packLocalCrate.mockRejectedValue(new Error('mock pack failure'))

  await expect(
    proveSameCratePublication(context, plan, checksumOf('packed-crate'))
  ).resolves.toBe(false)
})
