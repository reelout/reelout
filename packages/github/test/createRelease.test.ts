// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { buildReleaseNotes, type ReleasePlan } from '@reelout/core'
import { createRelease } from '@reelout/github'
import { beforeEach, expect, test, vi } from 'vitest'
import { context, logger, repository } from '../../../test/mock/context'
import { createMockCommit } from '../../../test/mock/git'

const getReleaseByTag = vi.hoisted(() => vi.fn())

const createReleaseMock = vi.hoisted(() => vi.fn())

const updateRelease = vi.hoisted(() => vi.fn())

const deleteRelease = vi.hoisted(() => vi.fn())

const Octokit = vi.hoisted(() =>
  vi.fn(function () {
    return {
      rest: {
        repos: {
          getReleaseByTag,
          createRelease: createReleaseMock,
          updateRelease,
          deleteRelease,
        },
      },
    }
  })
)

vi.mock('@octokit/rest', () => ({ Octokit }))

const notFound = () => Object.assign(new Error('Not Found'), { status: 404 })

beforeEach(() => {
  vi.clearAllMocks()
  getReleaseByTag.mockRejectedValue(notFound())
})

test('returns a no-op rollback without a tag message', async () => {
  const first = await createRelease(
    context,
    { package: { location: '.' }, release: null } as ReleasePlan,
    'token',
    repository
  )

  const second = await createRelease(
    context,
    {
      package: { location: '.' },
      release: { tag: { name: 'v1.2.3' } },
    } as ReleasePlan,
    'token',
    repository
  )

  await first()
  await second()

  expect(Octokit).not.toHaveBeenCalled()
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
    repository
  )

  expect(Octokit).toHaveBeenCalledTimes(1)
  expect(Octokit).toHaveBeenCalledWith(
    expect.objectContaining({ auth: 'mock-token' })
  )
  expect(getReleaseByTag).toHaveBeenCalledWith({
    owner: 'mock-owner',
    repo: 'mock-repo',
    tag: 'v1.2.3',
  })
  expect(createReleaseMock).toHaveBeenCalledTimes(1)
  expect(createReleaseMock).toHaveBeenCalledWith({
    owner: 'mock-owner',
    repo: 'mock-repo',
    tag_name: 'v1.2.3',
    target_commitish: 'abc123',
    name: 'v1.2.3',
    body: '## Bug Fixes\n\n- resolve an issue abc123\n',
    draft: false,
    prerelease: false,
  })
  expect(deleteRelease).not.toHaveBeenCalled()

  getReleaseByTag.mockResolvedValueOnce({ data: { id: 42 } })

  await rollback()

  expect(deleteRelease).toHaveBeenCalledTimes(1)
  expect(deleteRelease).toHaveBeenCalledWith({
    owner: 'mock-owner',
    repo: 'mock-repo',
    release_id: 42,
  })
})

test('overwrites an existing release and returns a rollback that restores it', async () => {
  getReleaseByTag.mockResolvedValueOnce({
    data: { id: 42, name: 'Original name', body: 'Original body' },
  })

  const rollback = await createRelease(
    context,
    {
      package: { location: '.' },
      release: { tag: { name: 'v1.2.3', message: 'Overwrite notes' } },
    } as ReleasePlan,
    'mock-token',
    repository
  )

  expect(updateRelease).toHaveBeenCalledTimes(1)
  expect(updateRelease).toHaveBeenCalledWith({
    owner: 'mock-owner',
    repo: 'mock-repo',
    release_id: 42,
    name: 'v1.2.3',
    body: 'Overwrite notes',
  })
  expect(createReleaseMock).not.toHaveBeenCalled()
  expect(logger.mock.calls).toContainEqual([
    'GitHub release for tag "v1.2.3" already exists: its name and notes were overwritten with the freshly generated content.',
  ])

  await rollback()

  expect(updateRelease).toHaveBeenCalledTimes(2)
  expect(updateRelease).toHaveBeenLastCalledWith({
    owner: 'mock-owner',
    repo: 'mock-repo',
    release_id: 42,
    name: 'Original name',
    body: 'Original body',
  })
  expect(deleteRelease).not.toHaveBeenCalled()
})

test('rethrows non-404 fetch errors', async () => {
  getReleaseByTag.mockRejectedValueOnce(
    Object.assign(new Error('Internal Server Error'), { status: 500 })
  )

  await expect(
    createRelease(
      context,
      {
        package: { location: '.' },
        release: { tag: { name: 'v1.2.3', message: 'Notes' } },
      } as ReleasePlan,
      'token',
      repository
    )
  ).rejects.toThrow('Internal Server Error')

  expect(createReleaseMock).not.toHaveBeenCalled()
})
