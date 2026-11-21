// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import '../../../test/mock/env'

import type { ReleasePlan } from '@reelout/core'
import type { CompleteReleasePlan, PackageManagerInfo } from '@reelout/npm'
import { probeReleasePlan } from '@reelout/npm'
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

test('returns without verifying when the version is absent from the registry', async () => {
  probePublishedVersion.mockResolvedValueOnce({ status: 'absent' })

  const skipped = new Set<ReleasePlan>()

  await probeReleasePlan(context, plan, packageManager, skipped)

  expect(proveSamePublication).not.toHaveBeenCalled()
  expect(syncDistTag).not.toHaveBeenCalled()
  expect(skipped.size).toBe(0)
})

test('skips the publish and syncs the dist-tag when the published version is identical', async () => {
  probePublishedVersion.mockResolvedValueOnce({
    status: 'published',
    tarballUrl: TARBALL_URL,
    integrity: 'sha512-recorded-digest',
    distTags: { latest: '1.0.0' },
  })
  proveSamePublication.mockResolvedValueOnce(true)

  const skipped = new Set<ReleasePlan>()

  await probeReleasePlan(context, plan, packageManager, skipped)

  expect(proveSamePublication).toHaveBeenCalledWith(
    context,
    plan,
    packageManager,
    TARBALL_URL,
    'sha512-recorded-digest'
  )
  expect(syncDistTag).toHaveBeenCalledWith(context, plan, packageManager, {
    latest: '1.0.0',
  })
  expect(skipped.size).toBe(1)
  expect(logger).toHaveBeenCalledWith(
    expect.stringContaining('Skipping publish of "a@1.2.3"')
  )
})

test('rejects when the published version cannot be verified as identical', async () => {
  probePublishedVersion.mockResolvedValueOnce({
    status: 'published',
    tarballUrl: TARBALL_URL,
    integrity: 'sha512-recorded-digest',
    distTags: { latest: '1.0.0' },
  })
  proveSamePublication.mockResolvedValueOnce(false)

  const skipped = new Set<ReleasePlan>()

  await expect(
    probeReleasePlan(context, plan, packageManager, skipped)
  ).rejects.toThrow(
    'Version "a@1.2.3" was not published: the registry already has this version and its content could not be verified as identical.'
  )

  expect(syncDistTag).not.toHaveBeenCalled()
  expect(skipped.size).toBe(0)
})
