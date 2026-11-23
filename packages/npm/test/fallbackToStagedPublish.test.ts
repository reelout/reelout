// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import {
  fallbackToStagedPublish,
  type CompleteReleasePlan,
  type PackageManagerInfo,
} from '@reelout/npm'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { context, logger } from '../../../test/mock/context'

const publishPackage = vi.hoisted(() => vi.fn())

const resolvePublishRegistry = vi.hoisted(() => vi.fn())

vi.mock(import('@reelout/npm/publishPackage'), () => ({
  publishPackage,
}))

vi.mock(
  import('@reelout/npm/resolvePublishRegistry'),
  async (importOriginal) => {
    const actual = await importOriginal()

    return { ...actual, resolvePublishRegistry }
  }
)

const npmPackageManager: PackageManagerInfo = {
  name: 'npm',
  isNpm: true,
  isPnpm: false,
  isYarn: false,
  isYarnClassic: false,
  isYarnBerry: false,
}

const yarnClassicPackageManager: PackageManagerInfo = {
  name: 'yarn',
  isNpm: false,
  isPnpm: false,
  isYarn: true,
  isYarnClassic: true,
  isYarnBerry: false,
}

const plan: CompleteReleasePlan = {
  package: {
    provider: '@reelout/npm',
    name: 'foo',
    version: '1.0.0',
    private: false,
    root: false,
    entry: false,
    dependencies: [],
    location: '.',
  },
  history: [],
  release: { type: 'minor', version: '1.1.0' },
}

const stageRequiredError = () => new Error('npm error code E_STAGE_REQUIRED')

const warnCalls = (): string[] =>
  logger.mock.calls.flatMap(([message]) =>
    typeof message === 'string' ? [message] : []
  )

beforeEach(() => {
  resolvePublishRegistry.mockResolvedValue('https://registry.npmjs.org/')
})

afterEach(() => {
  vi.resetAllMocks()
})

test('falls back to staged publishing on the public npm registry', async () => {
  const staged = await fallbackToStagedPublish(
    context,
    plan,
    npmPackageManager,
    { dryRun: false, tag: 'next' },
    stageRequiredError()
  )

  expect(staged).toBe(true)
  expect(publishPackage).toHaveBeenCalledTimes(1)
  expect(publishPackage.mock.calls[0]?.[2]).toEqual({
    dryRun: false,
    tag: 'next',
    stage: true,
  })
  expect(
    warnCalls().filter((message) =>
      message.includes('Falling back to staged publish of "foo@1.1.0"')
    )
  ).toHaveLength(1)
})

test('falls back to staged publishing on the default Yarn registry', async () => {
  resolvePublishRegistry.mockResolvedValue('https://registry.yarnpkg.com/')

  const staged = await fallbackToStagedPublish(
    context,
    plan,
    npmPackageManager,
    {},
    stageRequiredError()
  )

  expect(staged).toBe(true)
  expect(publishPackage).toHaveBeenCalledTimes(1)
})

test('warns and skips the fallback when the stage option disables it', async () => {
  const staged = await fallbackToStagedPublish(
    context,
    plan,
    npmPackageManager,
    { stage: false },
    stageRequiredError()
  )

  expect(staged).toBe(false)
  expect(publishPackage).not.toHaveBeenCalled()
  expect(
    warnCalls().filter((message) =>
      message.includes(
        'Staged publish fallback for "foo@1.1.0" is disabled: the "stage" option is set to false. Set "stage" to true or remove the option to enable staged publishing.'
      )
    )
  ).toHaveLength(1)
})

test('skips the fallback for an already staged publish', async () => {
  const staged = await fallbackToStagedPublish(
    context,
    plan,
    npmPackageManager,
    { stage: true },
    stageRequiredError()
  )

  expect(staged).toBe(false)
  expect(publishPackage).not.toHaveBeenCalled()
})

test('fails when the package manager cannot stage', async () => {
  await expect(
    fallbackToStagedPublish(
      context,
      plan,
      yarnClassicPackageManager,
      {},
      stageRequiredError()
    )
  ).rejects.toThrow('Staged publishing is not supported by Yarn Classic.')

  expect(publishPackage).not.toHaveBeenCalled()
})

test('skips the fallback when the package targets another registry', async () => {
  resolvePublishRegistry.mockResolvedValue('https://registry.example.com/')

  const staged = await fallbackToStagedPublish(
    context,
    plan,
    npmPackageManager,
    {},
    stageRequiredError()
  )

  expect(staged).toBe(false)
  expect(publishPackage).not.toHaveBeenCalled()
})

test('propagates staged publish failures', async () => {
  publishPackage.mockRejectedValue(new Error('staged publish failed'))

  await expect(
    fallbackToStagedPublish(
      context,
      plan,
      npmPackageManager,
      {},
      stageRequiredError()
    )
  ).rejects.toThrow('staged publish failed')
})
