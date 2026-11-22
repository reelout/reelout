// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import {
  recoverFromCratePublishOverRejection,
  type CompleteReleasePlan,
} from '@reelout/cargo'
import { beforeEach, expect, test, vi } from 'vitest'
import { context, logger } from '../../../test/mock/context'

const probePublishedCrate = vi.hoisted(() => vi.fn())

const isIdentical = vi.hoisted(() => vi.fn())

vi.mock(import('@reelout/cargo/proveSameCratePublication'), () => ({
  proveSameCratePublication: isIdentical,
}))

vi.mock(import('@reelout/cargo/probePublishedCrate'), () => ({
  probePublishedCrate,
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

const index = { getRecords: vi.fn(), reload: vi.fn() }

const publishOverError = () =>
  new Error('crate version `1.2.3` is already uploaded')

const warnCalls = (): string[] =>
  logger.mock.calls.flatMap(([message]) =>
    typeof message === 'string' ? [message] : []
  )

beforeEach(() => {
  vi.resetAllMocks()
})

test('completes the plan when an identical version was published concurrently', async () => {
  probePublishedCrate.mockResolvedValue({
    status: 'published',
    cksum: 'checksum-published',
  })
  isIdentical.mockResolvedValue(true)

  const error = publishOverError()

  await recoverFromCratePublishOverRejection(context, plan, index, error)

  expect(
    warnCalls().some((message) =>
      message.includes(
        'Treating publish of "a@1.2.3" as complete: an identical version was published concurrently.'
      )
    )
  ).toBe(true)
})

test('re-probes the registry without the cache', async () => {
  probePublishedCrate.mockResolvedValue({ status: 'absent' })

  await recoverFromCratePublishOverRejection(
    context,
    plan,
    index,
    publishOverError()
  ).catch(() => undefined)

  expect(probePublishedCrate.mock.calls[0]).toEqual([
    'a',
    '1.2.3',
    { index, fresh: true },
  ])
})

test('rethrows the publish error when the re-probe fails', async () => {
  probePublishedCrate.mockRejectedValue(new Error('mock probe failure'))

  const error = publishOverError()

  await expect(
    recoverFromCratePublishOverRejection(context, plan, index, error)
  ).rejects.toBe(error)
})

test('rethrows the publish error when the version is absent', async () => {
  probePublishedCrate.mockResolvedValue({ status: 'absent' })

  const error = publishOverError()

  await expect(
    recoverFromCratePublishOverRejection(context, plan, index, error)
  ).rejects.toBe(error)
})

test('rethrows the publish error when the content is not identical', async () => {
  probePublishedCrate.mockResolvedValue({
    status: 'published',
    cksum: 'checksum-published',
  })
  isIdentical.mockResolvedValue(false)

  const error = publishOverError()

  await expect(
    recoverFromCratePublishOverRejection(context, plan, index, error)
  ).rejects.toBe(error)
})
