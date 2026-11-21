// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import '../../../test/mock/env'

import type { CompleteReleasePlan, PackageManagerInfo } from '@reelout/npm'
import { recoverFromPublishOverRejection } from '@reelout/npm'
import { beforeEach, expect, test, vi } from 'vitest'
import { context, logger } from '../../../test/mock/context'

const TARBALL_URL = 'https://registry.npmjs.org/a/-/a-1.2.3.tgz'

const probePublishedVersion = vi.hoisted(() => vi.fn())

const proveSamePublication = vi.hoisted(() => vi.fn())

const syncDistTag = vi.hoisted(() => vi.fn())

vi.mock(import('@reelout/npm/probePublishedVersion'), () => ({
  probePublishedVersion,
}))

vi.mock(import('@reelout/npm/proveSamePublication'), () => ({
  proveSamePublication,
}))

vi.mock(import('@reelout/npm/syncDistTag'), () => ({
  syncDistTag,
}))

const packageManager = { name: 'npm' } as PackageManagerInfo

const plan: CompleteReleasePlan = {
  package: {
    provider: 'npm',
    name: 'a',
    version: '1.2.2',
    private: false,
    root: false,
    entry: false,
    dependencies: [],
    location: 'a',
  },
  history: [],
  release: { type: 'patch', version: '1.2.3' },
}

beforeEach(() => {
  vi.clearAllMocks()
})

test('rethrows the publish error when the version cannot be re-probed', async () => {
  probePublishedVersion.mockRejectedValueOnce(new Error('probe failed'))

  const publishError = new Error('publish failed')

  await expect(
    recoverFromPublishOverRejection(context, plan, packageManager, publishError)
  ).rejects.toBe(publishError)

  expect(proveSamePublication).not.toHaveBeenCalled()
})

test('rethrows the publish error when the re-probed version is absent', async () => {
  probePublishedVersion.mockResolvedValueOnce({ status: 'absent' })

  const publishError = new Error('publish failed')

  await expect(
    recoverFromPublishOverRejection(context, plan, packageManager, publishError)
  ).rejects.toBe(publishError)

  expect(proveSamePublication).not.toHaveBeenCalled()
})

test('rethrows the publish error when the concurrently published version differs', async () => {
  probePublishedVersion.mockResolvedValueOnce({
    status: 'published',
    tarballUrl: TARBALL_URL,
    integrity: 'sha512-recorded-digest',
    distTags: { latest: '1.0.0' },
  })
  proveSamePublication.mockResolvedValueOnce(false)

  const publishError = new Error('publish failed')

  await expect(
    recoverFromPublishOverRejection(context, plan, packageManager, publishError)
  ).rejects.toBe(publishError)

  expect(syncDistTag).not.toHaveBeenCalled()
})

test('completes the plan and syncs the dist-tag when the concurrent publication is identical', async () => {
  probePublishedVersion.mockResolvedValueOnce({
    status: 'published',
    tarballUrl: TARBALL_URL,
    integrity: 'sha512-recorded-digest',
    distTags: { latest: '1.0.0' },
  })
  proveSamePublication.mockResolvedValueOnce(true)

  const publishError = new Error('publish failed')

  await expect(
    recoverFromPublishOverRejection(context, plan, packageManager, publishError)
  ).resolves.toBeUndefined()

  expect(syncDistTag).toHaveBeenCalledWith(context, plan, packageManager, {
    latest: '1.0.0',
  })
  expect(logger).toHaveBeenCalledWith(
    expect.stringContaining('Treating publish of "a@1.2.3" as complete')
  )
})
