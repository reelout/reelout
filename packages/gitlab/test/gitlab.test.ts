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

const createRelease = vi.hoisted(() => vi.fn())

const deleteRelease = vi.hoisted(() => vi.fn())

const restoreRelease = vi.hoisted(() => vi.fn())

const verifyToken = vi.hoisted(() => vi.fn())

vi.mock(import('@reelout/gitlab/createRelease'), () => ({
  createRelease,
}))

vi.mock(import('@reelout/gitlab/deleteRelease'), () => ({
  deleteRelease,
}))

vi.mock(import('@reelout/gitlab/restoreRelease'), () => ({
  restoreRelease,
}))

vi.mock(import('@reelout/gitlab/verifyToken'), () => ({
  verifyToken,
}))

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
  vi.resetAllMocks()
})

test('skips gitlab release creation when GITLAB_TOKEN environment variable is missing', async () => {
  vi.stubEnv('GITLAB_TOKEN', undefined)

  context.repository = createMockRepository('gitlab')

  context.plans = plans

  await executeReleaseWorkflow(context, [plugin()])

  expect(context.outcome?.status).toBe('success')
  expect(verifyToken).not.toHaveBeenCalled()
  expect(createRelease).not.toHaveBeenCalled()
  expect(deleteRelease).not.toHaveBeenCalled()
  expect(context.skippedSteps).toMatchInlineSnapshot(`
    [
      {
        "hook": "publish",
        "plugin": "@reelout/gitlab",
        "reason": "GITLAB_TOKEN is not set.",
      },
    ]
  `)
  expect(logger.mock.calls).toMatchInlineSnapshot(`
    [
      [
        "GitLab releases were not created: GITLAB_TOKEN is required for GitLab authentication.",
      ],
      [
        "Status: [32mSUCCESS[39m",
      ],
      [
        "Skipped: [1m[33m1 skipped[39m[22m
    [43m @reelout/gitlab [49m GITLAB_TOKEN is not set.",
      ],
      [
        "Release complete: [33mNo packages are scheduled for release.[39m",
      ],
    ]
  `)
})

test('fails workflow execution when GITLAB_TOKEN environment variable is missing in strict mode', async () => {
  vi.stubEnv('GITLAB_TOKEN', undefined)

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
  expect(context.skippedSteps).toEqual([])
  expect(verifyToken).not.toHaveBeenCalled()
  expect(createRelease).not.toHaveBeenCalled()
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

  verifyToken.mockRejectedValueOnce(
    new Error('The GITLAB_TOKEN environment variable could not be verified.')
  )

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
  expect(createRelease).not.toHaveBeenCalled()
  expect(deleteRelease).not.toHaveBeenCalled()
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

test('fails workflow execution when repository context is unavailable', async () => {
  context.env = { GITLAB_TOKEN: 'token' }

  context.repository = null

  context.plans = plans

  await expect(
    executeReleaseWorkflow(context, [plugin()])
  ).rejects.toMatchInlineSnapshot(
    `[Error: A Git repository is required to create a GitLab release.]`
  )

  expect(createRelease).not.toHaveBeenCalled()
  expect(logger.mock.calls).toMatchInlineSnapshot(`
    [
      [
        "Status: [31mFAILURE[39m",
      ],
      [
        "Release complete: [31mA Git repository is required to create a GitLab release.[39m",
      ],
    ]
  `)
})

test('skips creating gitlab releases during dry-run mode', async () => {
  context.env = { GITLAB_TOKEN: 'token' }

  context.dryRun = true

  context.repository = createMockRepository('gitlab')

  context.plans = plans

  await executeReleaseWorkflow(context, [plugin()])

  expect(verifyToken).toHaveBeenCalledTimes(1)
  expect(verifyToken).toHaveBeenCalledWith('token')
  expect(createRelease).toHaveBeenCalledTimes(0)
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

test('previews the gitlab release skip during dry-run mode when GITLAB_TOKEN environment variable is missing', async () => {
  vi.stubEnv('GITLAB_TOKEN', undefined)

  context.dryRun = true

  context.repository = createMockRepository('gitlab')

  context.plans = plans

  await executeReleaseWorkflow(context, [plugin()])

  expect(context.outcome?.status).toBe('success')
  expect(verifyToken).not.toHaveBeenCalled()
  expect(createRelease).not.toHaveBeenCalled()
  expect(deleteRelease).not.toHaveBeenCalled()
  expect(context.skippedSteps).toMatchInlineSnapshot(`
    [
      {
        "hook": "publish",
        "plugin": "@reelout/gitlab",
        "reason": "GITLAB_TOKEN is not set.",
      },
    ]
  `)
  expect(logger.mock.calls).toMatchInlineSnapshot(`
    [
      [
        "GitLab releases were not created: GITLAB_TOKEN is required for GitLab authentication.",
      ],
      [
        "Status: [32mSUCCESS[39m",
      ],
      [
        "Skipped: [1m[33m1 skipped[39m[22m
    [43m @reelout/gitlab [49m GITLAB_TOKEN is not set.",
      ],
      [
        "Release complete: [33mNo packages are scheduled for release.[39m",
      ],
    ]
  `)
})

test('creates gitlab releases for packages in reverse alphabetical order', async () => {
  context.env = { GITLAB_TOKEN: 'token' }

  context.repository = createMockRepository('gitlab')

  context.plans = plans

  await executeReleaseWorkflow(context, [plugin()])

  expect(createRelease).toHaveBeenCalledTimes(3)
  expect(createRelease).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({ cwd: '/repo' }),
    expect.objectContaining({
      package: expect.objectContaining({ entry: false, name: 'b' }),
    }),
    'token',
    {
      host: 'gitlab',
      owner: 'mock-owner',
      repo: 'mock-repo',
      url: 'https://gitlab.com/mock-owner/mock-repo',
    }
  )
  expect(createRelease).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({ cwd: '/repo' }),
    expect.objectContaining({
      package: expect.objectContaining({ entry: false, name: 'a' }),
    }),
    'token',
    {
      host: 'gitlab',
      owner: 'mock-owner',
      repo: 'mock-repo',
      url: 'https://gitlab.com/mock-owner/mock-repo',
    }
  )
  expect(createRelease).toHaveBeenNthCalledWith(
    3,
    expect.objectContaining({ cwd: '/repo' }),
    expect.objectContaining({
      package: expect.objectContaining({ entry: true }),
    }),
    'token',
    {
      host: 'gitlab',
      owner: 'mock-owner',
      repo: 'mock-repo',
      url: 'https://gitlab.com/mock-owner/mock-repo',
    }
  )
})

test('rolls back published gitlab releases when a subsequent plugin fails', async () => {
  context.env = { GITLAB_TOKEN: 'token' }

  context.repository = createMockRepository('gitlab')

  context.plans = plans

  createRelease.mockResolvedValue({ original: null })

  const plugins = [
    plugin(),
    {
      name: 'test',
      version: '1.0.0',
      publish: () => {
        throw new Error('Something went wrong')
      },
    },
  ]

  await expect(executeReleaseWorkflow(context, plugins)).rejects.toThrow(
    'Something went wrong'
  )

  expect(restoreRelease).not.toHaveBeenCalled()
  expect(deleteRelease.mock.calls).toMatchInlineSnapshot(`
    [
      [
        {
          "package": {
            "dependencies": [
              "a",
              "b",
            ],
            "entry": true,
            "location": ".",
          },
          "release": null,
        },
        "token",
        {
          "host": "gitlab",
          "owner": "mock-owner",
          "repo": "mock-repo",
          "url": "https://gitlab.com/mock-owner/mock-repo",
        },
      ],
      [
        {
          "package": {
            "dependencies": [
              "b",
            ],
            "entry": false,
            "location": "a",
            "name": "a",
          },
          "release": null,
        },
        "token",
        {
          "host": "gitlab",
          "owner": "mock-owner",
          "repo": "mock-repo",
          "url": "https://gitlab.com/mock-owner/mock-repo",
        },
      ],
      [
        {
          "package": {
            "dependencies": [],
            "entry": false,
            "location": "b",
            "name": "b",
          },
          "release": null,
        },
        "token",
        {
          "host": "gitlab",
          "owner": "mock-owner",
          "repo": "mock-repo",
          "url": "https://gitlab.com/mock-owner/mock-repo",
        },
      ],
    ]
  `)
})

test('restores overwritten gitlab releases instead of deleting them during rollback', async () => {
  context.env = { GITLAB_TOKEN: 'token' }

  context.repository = createMockRepository('gitlab')

  context.plans = plans

  const original = {
    name: 'Old release name',
    description: 'Old release description',
  }

  createRelease.mockImplementation(async (_context, plan) =>
    plan.package.name === 'b' ? { original } : { original: null }
  )

  const plugins = [
    plugin(),
    {
      name: 'test',
      version: '1.0.0',
      publish: () => {
        throw new Error('Something went wrong')
      },
    },
  ]

  await expect(executeReleaseWorkflow(context, plugins)).rejects.toThrow(
    'Something went wrong'
  )

  expect(restoreRelease).toHaveBeenCalledTimes(1)
  expect(restoreRelease).toHaveBeenCalledWith(
    expect.objectContaining({
      package: expect.objectContaining({ entry: false, name: 'b' }),
    }),
    original,
    'token',
    {
      host: 'gitlab',
      owner: 'mock-owner',
      repo: 'mock-repo',
      url: 'https://gitlab.com/mock-owner/mock-repo',
    }
  )

  expect(deleteRelease.mock.calls).toMatchInlineSnapshot(`
    [
      [
        {
          "package": {
            "dependencies": [
              "a",
              "b",
            ],
            "entry": true,
            "location": ".",
          },
          "release": null,
        },
        "token",
        {
          "host": "gitlab",
          "owner": "mock-owner",
          "repo": "mock-repo",
          "url": "https://gitlab.com/mock-owner/mock-repo",
        },
      ],
      [
        {
          "package": {
            "dependencies": [
              "b",
            ],
            "entry": false,
            "location": "a",
            "name": "a",
          },
          "release": null,
        },
        "token",
        {
          "host": "gitlab",
          "owner": "mock-owner",
          "repo": "mock-repo",
          "url": "https://gitlab.com/mock-owner/mock-repo",
        },
      ],
    ]
  `)
})

test('does not roll back gitlab releases that were not written during the run', async () => {
  context.env = { GITLAB_TOKEN: 'token' }

  context.repository = createMockRepository('gitlab')

  context.plans = plans

  createRelease.mockImplementation(async (_context, plan) =>
    plan.package.entry ? null : { original: null }
  )

  const plugins = [
    plugin(),
    {
      name: 'test',
      version: '1.0.0',
      publish: () => {
        throw new Error('Something went wrong')
      },
    },
  ]

  await expect(executeReleaseWorkflow(context, plugins)).rejects.toThrow(
    'Something went wrong'
  )

  expect(restoreRelease).not.toHaveBeenCalled()
  expect(deleteRelease).toHaveBeenCalledTimes(2)
  expect(
    deleteRelease.mock.calls.map((call) => call[0].package.location)
  ).toEqual(['a', 'b'])
})
