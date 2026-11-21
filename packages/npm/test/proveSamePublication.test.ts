// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import '../../../test/mock/env'

import type { ReleasePlan } from '@reelout/core'
import type { PackageManagerInfo } from '@reelout/npm'
import { proveSamePublication } from '@reelout/npm'
import { beforeEach, expect, test, vi } from 'vitest'
import { context } from '../../../test/mock/context'

const TARBALL_URL = 'https://registry.npmjs.org/a/-/a-1.2.3.tgz'

const packLocalTarball = vi.hoisted(() => vi.fn())

const downloadPublishedTarball = vi.hoisted(() => vi.fn())

const isTarballIntegrityMatch = vi.hoisted(() => vi.fn())

const isPackageTarballIdentical = vi.hoisted(() => vi.fn())

vi.mock(import('@reelout/npm/packLocalTarball'), () => ({
  packLocalTarball,
}))

vi.mock(import('@reelout/npm/downloadPublishedTarball'), () => ({
  downloadPublishedTarball,
}))

vi.mock(import('@reelout/npm/isTarballIntegrityMatch'), () => ({
  isTarballIntegrityMatch,
}))

vi.mock(import('@reelout/npm/isPackageTarballIdentical'), () => ({
  isPackageTarballIdentical,
}))

const packageManager = { name: 'npm' } as PackageManagerInfo

const plan = {
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
} as ReleasePlan

const localTarball = Buffer.from('local tarball')

const publishedTarball = Buffer.from('published tarball')

beforeEach(() => {
  vi.clearAllMocks()
  packLocalTarball.mockResolvedValue(localTarball)
})

test('reports the publication as unverified when the local tarball cannot be packed', async () => {
  packLocalTarball.mockRejectedValueOnce(new Error('pack failed'))

  await expect(
    proveSamePublication(
      context,
      plan,
      packageManager,
      TARBALL_URL,
      'sha512-recorded-digest'
    )
  ).resolves.toBe(false)

  expect(downloadPublishedTarball).not.toHaveBeenCalled()
})

test('verifies the publication through the recorded integrity without downloading', async () => {
  isTarballIntegrityMatch.mockReturnValueOnce(true)

  await expect(
    proveSamePublication(
      context,
      plan,
      packageManager,
      TARBALL_URL,
      'sha512-recorded-digest'
    )
  ).resolves.toBe(true)

  expect(isTarballIntegrityMatch).toHaveBeenCalledWith(
    localTarball,
    'sha512-recorded-digest'
  )
  expect(downloadPublishedTarball).not.toHaveBeenCalled()
})

test('reports the publication as unverified without a tarball URL or integrity', async () => {
  await expect(
    proveSamePublication(context, plan, packageManager, undefined, undefined)
  ).resolves.toBe(false)

  expect(isTarballIntegrityMatch).not.toHaveBeenCalled()
  expect(downloadPublishedTarball).not.toHaveBeenCalled()
})

test('reports the publication as unverified when the integrity does not match and no tarball URL exists', async () => {
  isTarballIntegrityMatch.mockReturnValueOnce(false)

  await expect(
    proveSamePublication(
      context,
      plan,
      packageManager,
      undefined,
      'sha512-recorded-digest'
    )
  ).resolves.toBe(false)

  expect(downloadPublishedTarball).not.toHaveBeenCalled()
})

test('reports the publication as unverified when the published tarball cannot be downloaded', async () => {
  downloadPublishedTarball.mockRejectedValueOnce(new Error('download failed'))

  await expect(
    proveSamePublication(context, plan, packageManager, TARBALL_URL, undefined)
  ).resolves.toBe(false)

  expect(downloadPublishedTarball).toHaveBeenCalledWith(
    context,
    plan,
    packageManager,
    TARBALL_URL
  )
})

test('verifies the publication by comparing the downloaded tarball content', async () => {
  downloadPublishedTarball.mockResolvedValueOnce(publishedTarball)
  isPackageTarballIdentical.mockReturnValueOnce(true)

  await expect(
    proveSamePublication(context, plan, packageManager, TARBALL_URL, undefined)
  ).resolves.toBe(true)

  expect(isPackageTarballIdentical).toHaveBeenCalledWith(
    publishedTarball,
    localTarball
  )
})

test('reports differing tarball content as unverified', async () => {
  downloadPublishedTarball.mockResolvedValueOnce(publishedTarball)
  isPackageTarballIdentical.mockReturnValueOnce(false)

  await expect(
    proveSamePublication(context, plan, packageManager, TARBALL_URL, undefined)
  ).resolves.toBe(false)
})
