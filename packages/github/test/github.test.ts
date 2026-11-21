// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import '../../../test/mock/env'

import {
  executeReleaseWorkflow,
  type ReleasePlan,
  type Tag,
} from '@reelout/core'
import plugin from '@reelout/github'
import { beforeEach, expect, test, vi } from 'vitest'
import { context, logger, repository } from '../../../test/mock/context'

const getRepo = vi.hoisted(() => vi.fn())

const getReleaseByTag = vi.hoisted(() => vi.fn())

const createRelease = vi.hoisted(() => vi.fn())

const updateRelease = vi.hoisted(() => vi.fn())

const deleteRelease = vi.hoisted(() => vi.fn())

const Octokit = vi.hoisted(() =>
  vi.fn(function () {
    return {
      rest: {
        repos: {
          get: getRepo,
          getReleaseByTag,
          createRelease,
          updateRelease,
          deleteRelease,
        },
      },
    }
  })
)

vi.mock('@octokit/rest', () => ({ Octokit }))

const notFound = () => Object.assign(new Error('Not Found'), { status: 404 })

const createReleasePlan = (
  location: string,
  name: string | undefined,
  tag?: Tag
): ReleasePlan => ({
  package: {
    name,
    version: '1.0.0',
    root: location === '.',
    entry: location === '.',
    dependencies: [],
    location,
  },
  history: [],
  release: tag ? { type: 'patch', version: '1.0.0', tag } : null,
})

const plan = createReleasePlan('a', 'a', {
  name: 'a@1.0.0',
  message: 'Notes for a',
})

beforeEach(() => {
  vi.resetAllMocks()
  getRepo.mockResolvedValue({ data: { full_name: 'mock-owner/mock-repo' } })
  getReleaseByTag.mockRejectedValue(notFound())
})

test('skips GitHub release creation when GITHUB_TOKEN is missing', async () => {
  context.repository = repository

  context.plans = [plan]

  await executeReleaseWorkflow(context, [plugin()])

  expect(Octokit).not.toHaveBeenCalled()
  expect(context.outcome?.status).toBe('success')
  expect(logger.mock.calls).toMatchInlineSnapshot(`
    [
      [
        "GitHub releases will not be created: GITHUB_TOKEN is not set.",
      ],
      [
        "Status: [32mSUCCESS[39m",
      ],
      [
        "Release complete: [1m[32m1 released[39m[22m [90m(0)[39m

    [44m a [49m[42m 1.0.0 ← 1.0.0 [49m[90m patch [39m
    ",
      ],
    ]
  `)
})

test('treats a whitespace-only GITHUB_TOKEN as missing', async () => {
  context.env = { GITHUB_TOKEN: '   ' }

  context.repository = repository

  context.plans = [plan]

  await executeReleaseWorkflow(context, [plugin()])

  expect(Octokit).not.toHaveBeenCalled()
})

test('fails workflow execution when GITHUB_TOKEN is missing in strict mode', async () => {
  context.strict = true

  context.repository = repository

  context.plans = [plan]

  await expect(
    executeReleaseWorkflow(context, [plugin()])
  ).rejects.toMatchInlineSnapshot(
    '[Error: The GITHUB_TOKEN environment variable is required in strict mode.]'
  )

  expect(Octokit).not.toHaveBeenCalled()
  expect(logger.mock.calls).toMatchInlineSnapshot(`
    [
      [
        "Status: [31mFAILURE[39m",
      ],
      [
        "Release complete: [31mThe GITHUB_TOKEN environment variable is required in strict mode.[39m",
      ],
    ]
  `)
})

test('fails workflow execution when the GitHub token is invalid', async () => {
  context.env = { GITHUB_TOKEN: 'token' }

  context.repository = repository

  context.plans = [plan]

  getRepo.mockRejectedValueOnce(
    Object.assign(new Error('Bad credentials'), { status: 401 })
  )

  await expect(
    executeReleaseWorkflow(context, [plugin()])
  ).rejects.toMatchInlineSnapshot(
    '[Error: The GITHUB_TOKEN environment variable could not be verified.]'
  )

  expect(getReleaseByTag).not.toHaveBeenCalled()
  expect(createRelease).not.toHaveBeenCalled()
})

test('fails workflow execution when the GitHub token is invalid during dry-run', async () => {
  context.env = { GITHUB_TOKEN: 'token' }

  context.dryRun = true

  context.repository = repository

  context.plans = [plan]

  getRepo.mockRejectedValueOnce(
    Object.assign(new Error('Bad credentials'), { status: 401 })
  )

  await expect(
    executeReleaseWorkflow(context, [plugin()])
  ).rejects.toMatchInlineSnapshot(
    '[Error: The GITHUB_TOKEN environment variable could not be verified.]'
  )

  expect(createRelease).not.toHaveBeenCalled()
})

test('fails workflow execution when repository context is unavailable', async () => {
  context.env = { GITHUB_TOKEN: 'token' }

  context.plans = [plan]

  await expect(
    executeReleaseWorkflow(context, [plugin()])
  ).rejects.toMatchInlineSnapshot(
    '[Error: A Git repository is required to create a GitHub release.]'
  )

  expect(createRelease).not.toHaveBeenCalled()
  expect(getRepo).not.toHaveBeenCalled()
  expect(logger.mock.calls).toMatchInlineSnapshot(`
    [
      [
        "Status: [31mFAILURE[39m",
      ],
      [
        "Release complete: [31mA Git repository is required to create a GitHub release.[39m",
      ],
    ]
  `)
})

test('verifies the GitHub token during dry-run mode without creating releases', async () => {
  context.env = { GITHUB_TOKEN: 'token' }

  context.dryRun = true

  context.repository = repository

  context.plans = [plan]

  await executeReleaseWorkflow(context, [plugin()])

  expect(getRepo).toHaveBeenCalledTimes(1)
  expect(getReleaseByTag).not.toHaveBeenCalled()
  expect(createRelease).not.toHaveBeenCalled()
})

test('previews the GitHub release skip during dry-run mode when GITHUB_TOKEN is missing', async () => {
  context.dryRun = true

  context.repository = repository

  context.plans = [plan]

  await executeReleaseWorkflow(context, [plugin()])

  expect(Octokit).not.toHaveBeenCalled()
  expect(logger.mock.calls).toMatchInlineSnapshot(`
    [
      [
        "GitHub releases will not be created: GITHUB_TOKEN is not set.",
      ],
      [
        "Status: [32mSUCCESS[39m [33m(dry run)[39m",
      ],
      [
        "Release complete: [1m[32m1 released[39m[22m [90m(0)[39m

    [44m a [49m[42m 1.0.0 ← 1.0.0 [49m[90m patch [39m
    ",
      ],
    ]
  `)
})

test('creates GitHub releases for packages in reverse alphabetical order', async () => {
  context.env = { GITHUB_TOKEN: 'token' }

  context.repository = repository

  context.plans = [
    createReleasePlan('b', 'b', { name: 'b@1.0.0', message: 'Notes for b' }),
    createReleasePlan('.', undefined, {
      name: 'v1.0.0',
      message: 'Notes for root',
    }),
    createReleasePlan('a', 'a', { name: 'a@1.0.0', message: 'Notes for a' }),
  ]

  await executeReleaseWorkflow(context, [plugin()])

  expect(getReleaseByTag).toHaveBeenCalledTimes(3)
  expect(createRelease).toHaveBeenCalledTimes(3)
  expect(createRelease).toHaveBeenNthCalledWith(1, {
    owner: 'mock-owner',
    repo: 'mock-repo',
    tag_name: 'b@1.0.0',
    target_commitish: 'abc123',
    name: 'b@1.0.0',
    body: 'Notes for b',
    draft: false,
    prerelease: false,
  })
  expect(createRelease).toHaveBeenNthCalledWith(2, {
    owner: 'mock-owner',
    repo: 'mock-repo',
    tag_name: 'a@1.0.0',
    target_commitish: 'abc123',
    name: 'a@1.0.0',
    body: 'Notes for a',
    draft: false,
    prerelease: false,
  })
  expect(createRelease).toHaveBeenNthCalledWith(3, {
    owner: 'mock-owner',
    repo: 'mock-repo',
    tag_name: 'v1.0.0',
    target_commitish: 'abc123',
    name: 'v1.0.0',
    body: 'Notes for root',
    draft: false,
    prerelease: false,
  })
})

test('overwrites an existing GitHub release for a planned tag', async () => {
  context.env = { GITHUB_TOKEN: 'token' }

  context.repository = repository

  context.plans = [plan]

  getReleaseByTag.mockResolvedValueOnce({
    data: { id: 42, name: 'Original name', body: 'Original body' },
  })

  await executeReleaseWorkflow(context, [plugin()])

  expect(updateRelease).toHaveBeenCalledTimes(1)
  expect(updateRelease).toHaveBeenCalledWith({
    owner: 'mock-owner',
    repo: 'mock-repo',
    release_id: 42,
    name: 'a@1.0.0',
    body: 'Notes for a',
  })
  expect(createRelease).not.toHaveBeenCalled()
  expect(logger.mock.calls).toContainEqual([
    'GitHub release for tag "a@1.0.0" already exists: its name and notes were overwritten with the freshly generated content.',
  ])
})

test('restores an overwritten GitHub release when a subsequent plugin fails', async () => {
  context.env = { GITHUB_TOKEN: 'token' }

  context.repository = repository

  context.plans = [plan]

  getReleaseByTag.mockResolvedValueOnce({
    data: { id: 42, name: 'Original name', body: 'Original body' },
  })

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

  expect(updateRelease.mock.calls).toMatchInlineSnapshot(`
    [
      [
        {
          "body": "Notes for a",
          "name": "a@1.0.0",
          "owner": "mock-owner",
          "release_id": 42,
          "repo": "mock-repo",
        },
      ],
      [
        {
          "body": "Original body",
          "name": "Original name",
          "owner": "mock-owner",
          "release_id": 42,
          "repo": "mock-repo",
        },
      ],
    ]
  `)
  expect(deleteRelease).not.toHaveBeenCalled()
})

test('deletes created GitHub releases when a subsequent plugin fails', async () => {
  context.env = { GITHUB_TOKEN: 'token' }

  context.repository = repository

  context.plans = [plan]

  getReleaseByTag
    .mockRejectedValueOnce(notFound())
    .mockResolvedValueOnce({ data: { id: 42 } })

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

  expect(deleteRelease).toHaveBeenCalledTimes(1)
  expect(deleteRelease).toHaveBeenCalledWith({
    owner: 'mock-owner',
    repo: 'mock-repo',
    release_id: 42,
  })
  expect(updateRelease).not.toHaveBeenCalled()
})
