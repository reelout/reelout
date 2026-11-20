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

const Gitlab = vi.hoisted(() =>
  vi.fn(function () {
    return {
      ProjectReleases: {
        create: createReleaseMock,
        edit: editReleaseMock,
        show: showReleaseMock,
      },
    }
  })
)

vi.mock('@gitbeaker/rest', () => ({ Gitlab }))

beforeEach(() => {
  vi.clearAllMocks()
  showReleaseMock.mockRejectedValue({ cause: { response: { status: 404 } } })
})

test('does not fetch or create a release without a message', async () => {
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

  expect(first).toBeNull()
  expect(second).toBeNull()
  expect(Gitlab).not.toHaveBeenCalled()
  expect(showReleaseMock).not.toHaveBeenCalled()
  expect(editReleaseMock).not.toHaveBeenCalled()
  expect(createReleaseMock).not.toHaveBeenCalled()
})

test('creates a release when no release exists for the tag', async () => {
  const result = await createRelease(
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

  expect(Gitlab).toHaveBeenCalledTimes(1)
  expect(Gitlab).toHaveBeenCalledWith(
    expect.objectContaining({ token: 'mock-token' })
  )
  expect(showReleaseMock).toHaveBeenCalledTimes(1)
  expect(showReleaseMock).toHaveBeenCalledWith(
    encodeURIComponent('mock-owner/mock-repo'),
    'v1.2.3'
  )
  expect(editReleaseMock).not.toHaveBeenCalled()
  expect(createReleaseMock).toHaveBeenCalledTimes(1)
  expect(createReleaseMock).toHaveBeenCalledWith(
    encodeURIComponent('mock-owner/mock-repo'),
    {
      name: 'v1.2.3',
      tag_name: 'v1.2.3',
      description: '## Bug Fixes\n\n- resolve an issue abc123\n',
      ref: 'abc123',
    }
  )
  expect(result).toMatchInlineSnapshot(`
    {
      "original": null,
    }
  `)
})

test('updates an existing release with the generated content instead of creating a new one', async () => {
  showReleaseMock.mockResolvedValueOnce({
    name: 'Old release name',
    description: 'Old release description',
  })

  const result = await createRelease(
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

  expect(showReleaseMock).toHaveBeenCalledTimes(1)
  expect(showReleaseMock).toHaveBeenCalledWith(
    encodeURIComponent('mock-owner/mock-repo'),
    'v1.2.3'
  )
  expect(editReleaseMock).toHaveBeenCalledTimes(1)
  expect(editReleaseMock).toHaveBeenCalledWith(
    encodeURIComponent('mock-owner/mock-repo'),
    'v1.2.3',
    { name: 'v1.2.3', description: 'Release notes' }
  )
  expect(createReleaseMock).not.toHaveBeenCalled()
  expect(result).toMatchInlineSnapshot(`
    {
      "original": {
        "description": "Old release description",
        "name": "Old release name",
      },
    }
  `)
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
