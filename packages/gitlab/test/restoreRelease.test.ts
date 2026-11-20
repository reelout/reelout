// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { ReleasePlan } from '@reelout/core'
import { restoreRelease } from '@reelout/gitlab'
import { beforeEach, expect, test, vi } from 'vitest'
import { createMockRepository } from '../../../test/mock/context'

const editReleaseMock = vi.hoisted(() => vi.fn())

const Gitlab = vi.hoisted(() =>
  vi.fn(function () {
    return { ProjectReleases: { edit: editReleaseMock } }
  })
)

vi.mock('@gitbeaker/rest', () => ({ Gitlab }))

const original = {
  name: 'Old release name',
  description: 'Old release description',
}

beforeEach(() => {
  vi.clearAllMocks()
})

test('does not restore a release without a tag name', async () => {
  await restoreRelease(
    { release: null } as ReleasePlan,
    original,
    'token',
    createMockRepository('gitlab')
  )

  await restoreRelease(
    { release: { tag: {} } } as ReleasePlan,
    original,
    'token',
    createMockRepository('gitlab')
  )

  expect(Gitlab).not.toHaveBeenCalled()
})

test('restores the original release content', async () => {
  await restoreRelease(
    { release: { tag: { name: 'v1.2.3' } } } as ReleasePlan,
    original,
    'mock-token',
    createMockRepository('gitlab')
  )

  expect(Gitlab).toHaveBeenCalledTimes(1)
  expect(Gitlab).toHaveBeenCalledWith(
    expect.objectContaining({ token: 'mock-token' })
  )
  expect(editReleaseMock).toHaveBeenCalledTimes(1)
  expect(editReleaseMock).toHaveBeenCalledWith(
    encodeURIComponent('mock-owner/mock-repo'),
    'v1.2.3',
    { name: 'Old release name', description: 'Old release description' }
  )
})
