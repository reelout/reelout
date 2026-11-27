// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import '../../../test/mock/env'

import { executeReleaseWorkflow, type ReleasePlan } from '@reelout/core'
import plugin from '@reelout/gitlab'
import { beforeEach, expect, test, vi } from 'vitest'
import {
  context,
  createMockLogger,
  createMockRepository,
  logger,
} from '../../../test/mock/context'

const showProjectMock = vi.hoisted(() => vi.fn())

const showReleaseMock = vi.hoisted(() => vi.fn())

const editReleaseMock = vi.hoisted(() => vi.fn())

const createReleaseMock = vi.hoisted(() => vi.fn())

const removeReleaseMock = vi.hoisted(() => vi.fn())

const Gitlab = vi.hoisted(() =>
  vi.fn(function () {
    return {
      Projects: { show: showProjectMock },
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

const notFoundResponse = () => ({ cause: { response: { status: 404 } } })

const createReleasePlan = (location: string, tag: string): ReleasePlan =>
  ({
    package: { location },
    release: { tag: { name: tag, message: `Release notes for ${tag}` } },
  }) as ReleasePlan

const createNamedReleasePlan = (name: string, tag: string): ReleasePlan =>
  ({
    package: { location: name, name },
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

const plans = [
  {
    package: { entry: false, location: 'b', name: 'b', dependencies: [] },
    release: null,
  },
  {
    package: { entry: true, location: '.', dependencies: ['a', 'b'] },
    release: null,
  },
  {
    package: { entry: false, location: 'a', name: 'a', dependencies: ['b'] },
    release: null,
  },
] as ReleasePlan[]

beforeEach(() => {
  vi.clearAllMocks()
  showReleaseMock.mockRejectedValue(notFoundResponse())
})

test('skips GitLab release creation when GITLAB_TOKEN environment variable is missing', async () => {
  context.logger = createMockLogger(logger)
  context.repository = createMockRepository('gitlab')

  context.plans = plans

  await executeReleaseWorkflow(context, [plugin()])

  expect(context.outcome?.status).toBe('success')
  expect(showProjectMock).not.toHaveBeenCalled()
  expect(createReleaseMock).not.toHaveBeenCalled()
  expect(removeReleaseMock).not.toHaveBeenCalled()
  expect(logger.mock.calls).toMatchInlineSnapshot(`
    [
      [
        "Status: [32mSUCCESS[39m",
      ],
      [
        "Release complete: [33mNo packages are scheduled for release.[39m",
      ],
    ]
  `)
})

test('fails workflow execution when GITLAB_TOKEN environment variable is missing in strict mode', async () => {
  context.strict = true

  context.repository = createMockRepository('gitlab')

  context.plans = plans

  await expect(
    executeReleaseWorkflow(context, [plugin()])
  ).rejects.toMatchInlineSnapshot(
    `[Error: The GITLAB_TOKEN environment variable is required in strict mode.]`
  )

  expect(context.outcome?.phase).toMatchInlineSnapshot(`
    {
      "hook": "configure",
      "plugin": "@reelout/gitlab",
    }
  `)
  expect(showProjectMock).not.toHaveBeenCalled()
  expect(createReleaseMock).not.toHaveBeenCalled()
  expect(logger.mock.calls).toMatchInlineSnapshot(`
    [
      [
        "Status: [31mFAILURE[39m",
      ],
      [
        "Release complete: [31mThe GITLAB_TOKEN environment variable is required in strict mode.[39m",
      ],
    ]
  `)
})

test('fails workflow execution when GITLAB_TOKEN fails verification', async () => {
  context.env = { GITLAB_TOKEN: 'token' }

  context.repository = createMockRepository('gitlab')

  context.plans = plans

  showProjectMock.mockRejectedValueOnce(new Error('Unauthorized'))

  await expect(
    executeReleaseWorkflow(context, [plugin()])
  ).rejects.toMatchInlineSnapshot(
    `[Error: The GITLAB_TOKEN environment variable could not be verified.]`
  )

  expect(context.outcome?.phase).toMatchInlineSnapshot(`
    {
      "hook": "configure",
      "plugin": "@reelout/gitlab",
    }
  `)
  expect(createReleaseMock).not.toHaveBeenCalled()
  expect(removeReleaseMock).not.toHaveBeenCalled()
  expect(logger.mock.calls).toMatchInlineSnapshot(`
    [
      [
        "Status: [31mFAILURE[39m",
      ],
      [
        "Release complete: [31mThe GITLAB_TOKEN environment variable could not be verified.[39m",
      ],
    ]
  `)
})

test('skips GitLab publishing and stays inactive when repository context is unavailable', async () => {
  context.logger = createMockLogger(logger)
  context.env = { GITLAB_TOKEN: 'token' }

  context.repository = null

  context.plans = plans

  await executeReleaseWorkflow(context, [plugin()])

  expect(context.outcome?.status).toBe('success')
  expect(createReleaseMock).not.toHaveBeenCalled()
  expect(showProjectMock).not.toHaveBeenCalled()
  expect(logger.mock.calls).toMatchInlineSnapshot(`
    [
      [
        "Status: [32mSUCCESS[39m",
      ],
      [
        "Release complete: [33mNo packages are scheduled for release.[39m",
      ],
    ]
  `)
})

test('stays inactive when the repository is hosted on GitHub, even in strict mode', async () => {
  context.env = { GITLAB_TOKEN: 'token' }

  context.strict = true

  context.repository = createMockRepository('github')

  context.plans = plans

  await executeReleaseWorkflow(context, [plugin()])

  expect(context.outcome?.status).toBe('success')
  expect(showProjectMock).not.toHaveBeenCalled()
  expect(createReleaseMock).not.toHaveBeenCalled()
})

test('skips creating GitLab releases during dry-run mode', async () => {
  context.logger = createMockLogger(logger)
  context.env = { GITLAB_TOKEN: 'token' }

  context.dryRun = true

  context.repository = createMockRepository('gitlab')

  context.plans = plans

  await executeReleaseWorkflow(context, [plugin()])

  expect(showProjectMock).toHaveBeenCalledTimes(1)
  expect(Gitlab).toHaveBeenCalledWith({ token: 'token' })
  expect(createReleaseMock).toHaveBeenCalledTimes(0)
  expect(logger.mock.calls).toMatchInlineSnapshot(`
    [
      [
        "Status: [32mSUCCESS[39m [33m(dry run)[39m",
      ],
      [
        "Release complete: [33mNo packages are scheduled for release.[39m",
      ],
    ]
  `)
})

test('previews the GitLab release skip during dry-run mode when GITLAB_TOKEN environment variable is missing', async () => {
  context.logger = createMockLogger(logger)
  context.dryRun = true

  context.repository = createMockRepository('gitlab')

  context.plans = plans

  await executeReleaseWorkflow(context, [plugin()])

  expect(context.outcome?.status).toBe('success')
  expect(showProjectMock).not.toHaveBeenCalled()
  expect(createReleaseMock).not.toHaveBeenCalled()
  expect(removeReleaseMock).not.toHaveBeenCalled()
  expect(logger.mock.calls).toMatchInlineSnapshot(`
    [
      [
        "Status: [32mSUCCESS[39m [33m(dry run)[39m",
      ],
      [
        "Release complete: [33mNo packages are scheduled for release.[39m",
      ],
    ]
  `)
})

test('creates GitLab releases for packages in reverse alphabetical order', async () => {
  context.env = { GITLAB_TOKEN: 'token' }

  context.repository = createMockRepository('gitlab')

  context.plans = [
    createReleasePlan('.', 'v-root'),
    createNamedReleasePlan('a', 'v-a'),
    createNamedReleasePlan('b', 'v-b'),
  ]

  await executeReleaseWorkflow(context, [plugin()])

  expect(showProjectMock).toHaveBeenCalledTimes(1)
  expect(createReleaseMock).toHaveBeenCalledTimes(3)
  expect(createReleaseMock).toHaveBeenNthCalledWith(1, projectId, {
    name: 'v-b',
    tag_name: 'v-b',
    description: 'Release notes for v-b',
    ref: 'abc123',
  })
  expect(createReleaseMock).toHaveBeenNthCalledWith(2, projectId, {
    name: 'v-a',
    tag_name: 'v-a',
    description: 'Release notes for v-a',
    ref: 'abc123',
  })
  expect(createReleaseMock).toHaveBeenNthCalledWith(3, projectId, {
    name: 'v-root',
    tag_name: 'v-root',
    description: 'Release notes for v-root',
    ref: 'abc123',
  })
})

test('rolls back published GitLab releases when a subsequent plugin fails', async () => {
  context.env = { GITLAB_TOKEN: 'token' }

  context.repository = createMockRepository('gitlab')

  context.plans = [
    createReleasePlan('.', 'v-root'),
    createNamedReleasePlan('a', 'v-a'),
    createNamedReleasePlan('b', 'v-b'),
  ]

  await expect(
    executeReleaseWorkflow(context, [plugin(), failingPlugin])
  ).rejects.toThrow('Something went wrong')

  expect(createReleaseMock).toHaveBeenCalledTimes(3)
  expect(removeReleaseMock).toHaveBeenCalledTimes(3)
  expect(removeReleaseMock.mock.calls.map((call) => call[1])).toEqual([
    'v-b',
    'v-a',
    'v-root',
  ])
})

test('rolls back created GitLab releases when a later release creation fails mid-loop', async () => {
  context.env = { GITLAB_TOKEN: 'token' }

  context.repository = createMockRepository('gitlab')

  context.plans = [
    createNamedReleasePlan('a', 'v-a'),
    createNamedReleasePlan('b', 'v-b'),
  ]

  createReleaseMock
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new Error('Release creation failed'))

  await expect(executeReleaseWorkflow(context, [plugin()])).rejects.toThrow(
    'Release creation failed'
  )

  expect(createReleaseMock).toHaveBeenCalledTimes(2)
  expect(removeReleaseMock).toHaveBeenCalledTimes(1)
  expect(removeReleaseMock).toHaveBeenCalledWith(projectId, 'v-b')
})

test('restores overwritten GitLab releases instead of deleting them during rollback', async () => {
  context.env = { GITLAB_TOKEN: 'token' }

  context.repository = createMockRepository('gitlab')

  context.plans = [
    createReleasePlan('.', 'v-root'),
    createNamedReleasePlan('a', 'v-a'),
    createNamedReleasePlan('b', 'v-b'),
  ]

  showReleaseMock.mockImplementation(
    async (_projectId: string, tagName: string) => {
      if (tagName === 'v-b') {
        return existingRelease
      }

      throw notFoundResponse()
    }
  )

  await expect(
    executeReleaseWorkflow(context, [plugin(), failingPlugin])
  ).rejects.toThrow('Something went wrong')

  expect(createReleaseMock).toHaveBeenCalledTimes(2)
  expect(editReleaseMock).toHaveBeenCalledTimes(2)
  expect(editReleaseMock).toHaveBeenNthCalledWith(1, projectId, 'v-b', {
    name: 'v-b',
    description: 'Release notes for v-b',
  })
  expect(editReleaseMock).toHaveBeenNthCalledWith(2, projectId, 'v-b', {
    name: 'Old release name',
    description: 'Old release description',
  })
  expect(removeReleaseMock).toHaveBeenCalledTimes(2)
  expect(removeReleaseMock.mock.calls.map((call) => call[1])).toEqual([
    'v-a',
    'v-root',
  ])
  expect(logger.mock.calls).toContainEqual([
    'GitLab release for tag "v-b" already exists: its name and description were overwritten with the freshly generated content.',
  ])
})

test('does not roll back GitLab releases that were not written during the run', async () => {
  context.env = { GITLAB_TOKEN: 'token' }

  context.repository = createMockRepository('gitlab')

  context.plans = [
    { package: { location: '.' }, release: null } as ReleasePlan,
    createNamedReleasePlan('a', 'v-a'),
    createNamedReleasePlan('b', 'v-b'),
  ]

  await expect(
    executeReleaseWorkflow(context, [plugin(), failingPlugin])
  ).rejects.toThrow('Something went wrong')

  expect(createReleaseMock).toHaveBeenCalledTimes(2)
  expect(removeReleaseMock).toHaveBeenCalledTimes(2)
  expect(removeReleaseMock.mock.calls.map((call) => call[1])).toEqual([
    'v-b',
    'v-a',
  ])
})

test('updates an existing GitLab release with the generated content', async () => {
  context.env = { GITLAB_TOKEN: 'token' }

  context.repository = createMockRepository('gitlab')

  context.plans = [createReleasePlan('pkg', 'v1.0.0')]

  showReleaseMock.mockResolvedValueOnce(existingRelease)

  await executeReleaseWorkflow(context, [plugin()])

  expect(showProjectMock).toHaveBeenCalledTimes(1)
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
    'GitLab release for tag "v1.0.0" already exists: its name and description were overwritten with the freshly generated content.',
  ])
})

test('restores overwritten releases and deletes created releases independently during rollback', async () => {
  context.env = { GITLAB_TOKEN: 'token' }

  context.repository = createMockRepository('gitlab')

  context.plans = [
    createReleasePlan('a', 'v1.0.0'),
    createReleasePlan('b', 'v2.0.0'),
  ]

  showReleaseMock.mockImplementation(
    async (_projectId: string, tagName: string) => {
      if (tagName === 'v1.0.0') {
        return existingRelease
      }

      throw notFoundResponse()
    }
  )

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
