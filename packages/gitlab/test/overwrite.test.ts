// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import '../../../test/mock/env'

import { executeReleaseWorkflow, type ReleasePlan } from '@reelout/core'
import plugin from '@reelout/gitlab'
import { beforeEach, expect, test, vi } from 'vitest'
import {
  context,
  createMockRepository,
  logger,
} from '../../../test/mock/context'

const showCurrentUserMock = vi.hoisted(() => vi.fn())

const showReleaseMock = vi.hoisted(() => vi.fn())

const editReleaseMock = vi.hoisted(() => vi.fn())

const createReleaseMock = vi.hoisted(() => vi.fn())

const removeReleaseMock = vi.hoisted(() => vi.fn())

const Gitlab = vi.hoisted(() =>
  vi.fn(function () {
    return {
      Users: { showCurrentUser: showCurrentUserMock },
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

const createPlan = (location: string, tag: string): ReleasePlan =>
  ({
    package: { location },
    release: { tag: { name: tag, message: `Release notes for ${tag}` } },
  }) as ReleasePlan

const failingPlugin = {
  name: 'test',
  version: '1.0.0',
  publish: () => {
    throw new Error('Something went wrong')
  },
}

const projectId = encodeURIComponent('mock-owner/mock-repo')

const existingRelease = {
  name: 'Old release name',
  description: 'Old release description',
}

beforeEach(() => {
  vi.clearAllMocks()
})

test('updates an existing gitlab release with the generated content', async () => {
  context.env = { GITLAB_TOKEN: 'token' }

  context.repository = createMockRepository('gitlab')

  context.plans = [createPlan('pkg', 'v1.0.0')]

  showReleaseMock.mockResolvedValueOnce(existingRelease)

  await executeReleaseWorkflow(context, [plugin()])

  expect(showCurrentUserMock).toHaveBeenCalledTimes(1)
  expect(showReleaseMock).toHaveBeenCalledTimes(1)
  expect(showReleaseMock).toHaveBeenCalledWith(projectId, 'v1.0.0')
  expect(editReleaseMock).toHaveBeenCalledTimes(1)
  expect(editReleaseMock).toHaveBeenCalledWith(projectId, 'v1.0.0', {
    name: 'v1.0.0',
    description: 'Release notes for v1.0.0',
  })
  expect(createReleaseMock).not.toHaveBeenCalled()
  expect(removeReleaseMock).not.toHaveBeenCalled()
  expect(logger.mock.calls).toContainEqual([
    'An existing GitLab release for "v1.0.0" was overwritten.',
  ])
})

test('creates a gitlab release when none exists for the tag', async () => {
  context.env = { GITLAB_TOKEN: 'token' }

  context.repository = createMockRepository('gitlab')

  context.plans = [createPlan('pkg', 'v1.0.0')]

  showReleaseMock.mockRejectedValueOnce({
    cause: { response: { status: 404 } },
  })

  await executeReleaseWorkflow(context, [plugin()])

  expect(createReleaseMock).toHaveBeenCalledTimes(1)
  expect(createReleaseMock).toHaveBeenCalledWith(projectId, {
    name: 'v1.0.0',
    tag_name: 'v1.0.0',
    description: 'Release notes for v1.0.0',
    ref: 'abc123',
  })
  expect(editReleaseMock).not.toHaveBeenCalled()
  expect(removeReleaseMock).not.toHaveBeenCalled()
})

test('restores the original content instead of deleting an overwritten release during rollback', async () => {
  context.env = { GITLAB_TOKEN: 'token' }

  context.repository = createMockRepository('gitlab')

  context.plans = [createPlan('pkg', 'v1.0.0')]

  showReleaseMock.mockResolvedValueOnce(existingRelease)

  await expect(
    executeReleaseWorkflow(context, [plugin(), failingPlugin])
  ).rejects.toThrow('Something went wrong')

  expect(editReleaseMock).toHaveBeenCalledTimes(2)
  expect(editReleaseMock).toHaveBeenNthCalledWith(1, projectId, 'v1.0.0', {
    name: 'v1.0.0',
    description: 'Release notes for v1.0.0',
  })
  expect(editReleaseMock).toHaveBeenNthCalledWith(2, projectId, 'v1.0.0', {
    name: 'Old release name',
    description: 'Old release description',
  })
  expect(removeReleaseMock).not.toHaveBeenCalled()
})

test('deletes a gitlab release created by the run during rollback', async () => {
  context.env = { GITLAB_TOKEN: 'token' }

  context.repository = createMockRepository('gitlab')

  context.plans = [createPlan('pkg', 'v1.0.0')]

  showReleaseMock.mockRejectedValueOnce({
    cause: { response: { status: 404 } },
  })

  await expect(
    executeReleaseWorkflow(context, [plugin(), failingPlugin])
  ).rejects.toThrow('Something went wrong')

  expect(removeReleaseMock).toHaveBeenCalledTimes(1)
  expect(removeReleaseMock).toHaveBeenCalledWith(projectId, 'v1.0.0')
})

test('restores overwritten releases and deletes created releases independently during rollback', async () => {
  context.env = { GITLAB_TOKEN: 'token' }

  context.repository = createMockRepository('gitlab')

  context.plans = [createPlan('a', 'v1.0.0'), createPlan('b', 'v2.0.0')]

  showReleaseMock.mockImplementation(async (_projectId, tagName) => {
    if (tagName === 'v1.0.0') return existingRelease

    throw { cause: { response: { status: 404 } } }
  })

  await expect(
    executeReleaseWorkflow(context, [plugin(), failingPlugin])
  ).rejects.toThrow('Something went wrong')

  expect(editReleaseMock).toHaveBeenCalledTimes(2)
  expect(editReleaseMock).toHaveBeenNthCalledWith(2, projectId, 'v1.0.0', {
    name: 'Old release name',
    description: 'Old release description',
  })
  expect(removeReleaseMock).toHaveBeenCalledTimes(1)
  expect(removeReleaseMock).toHaveBeenCalledWith(projectId, 'v2.0.0')
})
