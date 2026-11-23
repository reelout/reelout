// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import '../../../test/mock/env'

import type { ReleasePlan } from '@reelout/core'
import type { PackageManagerInfo } from '@reelout/npm'
import { syncDistTag } from '@reelout/yarn'
import path from 'node:path'
import { beforeEach, expect, test, vi } from 'vitest'
import { context } from '../../../test/mock/context'

const NPMJS = 'https://registry.npmjs.org'

const execCommand = vi.hoisted(() => vi.fn())

const resolvePublishRegistry = vi.hoisted(() => vi.fn())

vi.mock(import('@reelout/core/util/execCommand'), () => ({
  execCommand: (command: string, args: readonly string[], options: unknown) =>
    execCommand(command, args, options),
}))

vi.mock(import('@reelout/yarn/prepareAuth'), () => ({
  prepareAuth: async () => undefined,
}))

vi.mock(import('@reelout/yarn/resolvePublishRegistry'), () => ({
  resolvePublishRegistry,
}))

const createPackageManager = (
  overrides: Partial<PackageManagerInfo> = {}
): PackageManagerInfo => ({
  name: 'yarn',
  isNpm: false,
  isPnpm: false,
  isYarn: true,
  isYarnClassic: true,
  isYarnBerry: false,
  ...overrides,
})

const plan: ReleasePlan = {
  package: {
    provider: '@reelout/yarn',
    name: 'a',
    version: '1.2.2',
    private: false,
    root: false,
    entry: false,
    dependencies: [],
    location: 'a',
  },
  history: [],
  release: { type: 'patch', version: '1.2.3' },
}

const packageDir = path.resolve(context.cwd, plan.package.location)

beforeEach(() => {
  vi.clearAllMocks()
  resolvePublishRegistry.mockResolvedValue(NPMJS)
})

test('skips the sync when the dist-tag already references the released version', async () => {
  await syncDistTag(context, plan, createPackageManager(), {
    latest: '1.2.3',
  })

  expect(execCommand).not.toHaveBeenCalled()
})

test('previews the dist-tag sync in dry-run mode', async () => {
  context.dryRun = true

  await syncDistTag(context, plan, createPackageManager(), {})

  expect(execCommand).not.toHaveBeenCalled()
})

test('syncs the dist-tag through npm with the resolved registry under Yarn Classic', async () => {
  await syncDistTag(context, plan, createPackageManager(), {
    latest: '1.0.0',
  })

  expect(execCommand).toHaveBeenCalledWith(
    'npm',
    ['dist-tag', 'add', 'a@1.2.3', 'latest', '--registry', NPMJS],
    expect.objectContaining({ cwd: packageDir })
  )
})

test('syncs the dist-tag through yarn berry without a registry', async () => {
  await syncDistTag(
    context,
    plan,
    createPackageManager({ isYarnClassic: false, isYarnBerry: true }),
    {}
  )

  expect(execCommand).toHaveBeenCalledWith(
    'yarn',
    ['npm', 'tag', 'add', 'a@1.2.3', 'latest'],
    expect.objectContaining({ cwd: packageDir })
  )
  expect(resolvePublishRegistry).not.toHaveBeenCalled()
})

test('syncs the configured release channel dist-tag', async () => {
  context.releaseChannel = 'next'

  await syncDistTag(context, plan, createPackageManager(), {
    latest: '1.2.3',
  })

  expect(execCommand).toHaveBeenCalledWith(
    'npm',
    ['dist-tag', 'add', 'a@1.2.3', 'next', '--registry', NPMJS],
    expect.objectContaining({ cwd: packageDir })
  )
})
