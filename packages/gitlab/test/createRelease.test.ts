// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { buildReleaseNotes, type ReleasePlan } from '@reelout/core'
import { createRelease } from '@reelout/gitlab'
import { beforeEach, expect, test, vi } from 'vitest'
import { context, createMockRepository } from '../../../test/mock/context'
import { createMockCommit } from '../../../test/mock/git'

const createReleaseMock = vi.hoisted(() => vi.fn())

const editReleaseMock = vi.hoisted(() => vi.fn())

const showReleaseMock = vi.hoisted(() => vi.fn())

const removeReleaseMock = vi.hoisted(() => vi.fn())

const Gitlab = vi.hoisted(() =>
  vi.fn(function () {
    return {
      ProjectReleases: {
        create: createReleaseMock,
        edit: editReleaseMock,
        remove: removeReleaseMock,
        show: showReleaseMock,
      },
    }
  })
)

vi.mock('@gitbeaker/rest', () => ({ Gitlab }))

const projectId = encodeURIComponent('mock-owner/mock-repo')

beforeEach(() => {
  vi.clearAllMocks()
  showReleaseMock.mockRejectedValue({ cause: { response: { status: 404 } } })
})

test('returns no rollback without a tag message', async () => {
  const first = await createRelease(
    context,
    {
      package: { location: '.' },
      release: null,
    } as ReleasePlan,
    'token',
    createMockRepository('gitlab')
  )

  const second = await createRelease(
    context,
    {
      package: { location: '.' },
      release: { tag: { name: 'v1.2.3' } },
    } as ReleasePlan,
    'token',
    createMockRepository('gitlab')
  )

  expect(first).toBeUndefined()
  expect(second).toBeUndefined()
  expect(Gitlab).not.toHaveBeenCalled()
  expect(showReleaseMock).not.toHaveBeenCalled()
  expect(editReleaseMock).not.toHaveBeenCalled()
  expect(createReleaseMock).not.toHaveBeenCalled()
})

test('creates a release and returns a rollback that deletes it', async () => {
  const rollback = await createRelease(
    context,
    {
      package: { location: '.' },
      release: {
        tag: {
          name: 'v1.2.3',
          message: await buildReleaseNotes(context, [
            await createMockCommit('abc123', 'fix: resolve an issue'),
          ]),
        },
      },
    } as ReleasePlan,
    'mock-token',
    createMockRepository('gitlab')
  )

  if (!rollback) {
    throw new Error('Expected createRelease to return a rollback.')
  }

  expect(Gitlab).toHaveBeenCalledTimes(1)
  expect(Gitlab).toHaveBeenCalledWith(
    expect.objectContaining({ token: 'mock-token' })
  )
  expect(showReleaseMock).toHaveBeenCalledTimes(1)
  expect(showReleaseMock).toHaveBeenCalledWith(projectId, 'v1.2.3')
  expect(editReleaseMock).not.toHaveBeenCalled()
  expect(createReleaseMock).toHaveBeenCalledTimes(1)
  expect(createReleaseMock).toHaveBeenCalledWith(projectId, {
    name: 'v1.2.3',
    tag_name: 'v1.2.3',
    description: '## Bug Fixes\n\n- resolve an issue abc123\n',
    ref: 'abc123',
  })
  expect(removeReleaseMock).not.toHaveBeenCalled()

  await rollback()

  expect(removeReleaseMock).toHaveBeenCalledTimes(1)
  expect(removeReleaseMock).toHaveBeenCalledWith(projectId, 'v1.2.3')
})

test('overwrites an existing release and returns a rollback that restores it', async () => {
  showReleaseMock.mockResolvedValueOnce({
    name: 'Old release name',
    description: 'Old release description',
  })

  const rollback = await createRelease(
    context,
    {
      package: { location: '.' },
      release: {
        tag: {
          name: 'v1.2.3',
          message: 'Release notes',
        },
      },
    } as ReleasePlan,
    'mock-token',
    createMockRepository('gitlab')
  )

  if (!rollback) {
    throw new Error('Expected createRelease to return a rollback.')
  }

  expect(showReleaseMock).toHaveBeenCalledTimes(1)
  expect(showReleaseMock).toHaveBeenCalledWith(projectId, 'v1.2.3')
  expect(editReleaseMock).toHaveBeenCalledTimes(1)
  expect(editReleaseMock).toHaveBeenCalledWith(projectId, 'v1.2.3', {
    name: 'v1.2.3',
    description: 'Release notes',
  })
  expect(createReleaseMock).not.toHaveBeenCalled()

  await rollback()

  expect(editReleaseMock).toHaveBeenCalledTimes(2)
  expect(editReleaseMock).toHaveBeenNthCalledWith(2, projectId, 'v1.2.3', {
    name: 'Old release name',
    description: 'Old release description',
  })
})

test('rethrows release fetch errors other than 404', async () => {
  showReleaseMock.mockRejectedValueOnce({
    cause: { response: { status: 500 } },
  })

  await expect(
    createRelease(
      context,
      {
        package: { location: '.' },
        release: { tag: { name: 'v1.2.3', message: 'Release notes' } },
      } as ReleasePlan,
      'mock-token',
      createMockRepository('gitlab')
    )
  ).rejects.toEqual({ cause: { response: { status: 500 } } })

  expect(editReleaseMock).not.toHaveBeenCalled()
  expect(createReleaseMock).not.toHaveBeenCalled()
})
