// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { Gitlab } from '@gitbeaker/rest'
import { fetchRelease } from '@reelout/gitlab'
import { beforeEach, expect, test, vi } from 'vitest'

const showRelease = vi.hoisted(() => vi.fn())

const api = {
  ProjectReleases: { show: showRelease },
} as unknown as Gitlab

const projectId = encodeURIComponent('mock-owner/mock-repo')

beforeEach(() => {
  vi.clearAllMocks()
})

test('captures the name and description of the release for the tag', async () => {
  showRelease.mockResolvedValueOnce({
    name: 'Old release name',
    description: 'Old release description',
  })

  await expect(fetchRelease(api, projectId, 'v1.2.3')).resolves.toEqual({
    name: 'Old release name',
    description: 'Old release description',
  })

  expect(showRelease).toHaveBeenCalledWith(projectId, 'v1.2.3')
})

test('returns null when the tag has no release', async () => {
  showRelease.mockRejectedValueOnce(
    Object.assign(new Error('404 Release not found'), {
      cause: { response: { status: 404 } },
    })
  )

  await expect(fetchRelease(api, projectId, 'v1.2.3')).resolves.toBeNull()
})

test('rethrows API errors other than not-found', async () => {
  const rejection = Object.assign(new Error('500 Internal Server Error'), {
    cause: { response: { status: 500 } },
  })

  showRelease.mockRejectedValueOnce(rejection)

  await expect(fetchRelease(api, projectId, 'v1.2.3')).rejects.toBe(rejection)
})
