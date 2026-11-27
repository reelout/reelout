// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import {
  createHostReleasePlugin,
  executeReleaseWorkflow,
  type ReleasePlan,
} from '@reelout/core'
import { beforeEach, expect, test, vi } from 'vitest'
import {
  context,
  createMockRepository,
  logger,
} from '../../../../test/mock/context'

const verifyToken = vi.hoisted(() => vi.fn())

const createRelease = vi.hoisted(() => vi.fn())

const createNamedPlan = (name: string): ReleasePlan => ({
  package: {
    name,
    version: '1.0.0',
    root: false,
    entry: false,
    dependencies: [],
    location: name,
  },
  history: [],
  release: {
    type: 'patch',
    version: '1.0.0',
    tag: { name: `${name}@1.0.0`, message: `Notes for ${name}` },
  },
})

const plugin = () =>
  createHostReleasePlugin({
    name: 'test-host',
    version: '1.0.0',
    host: 'github',
    displayName: 'TestHost',
    tokenEnvKey: 'TESTHOST_TOKEN',
    verifyToken,
    createRelease,
  })

beforeEach(() => {
  context.repository = createMockRepository('github')
  context.env = { TESTHOST_TOKEN: 'token' }
  context.plans = [createNamedPlan('a'), createNamedPlan('b')]
})

test('rolls back created host releases when a later release creation fails mid-loop', async () => {
  const rollback = vi.fn()

  createRelease
    .mockResolvedValueOnce(rollback)
    .mockRejectedValueOnce(new Error('Release creation failed'))

  await expect(executeReleaseWorkflow(context, [plugin()])).rejects.toThrow(
    'Release creation failed'
  )

  expect(rollback).toHaveBeenCalledTimes(1)
})

test('logs a failed mid-loop rollback without masking the original creation error', async () => {
  const rollback = vi.fn().mockRejectedValue(new Error('Rollback failed'))

  createRelease
    .mockResolvedValueOnce(rollback)
    .mockRejectedValueOnce(new Error('Release creation failed'))

  await expect(executeReleaseWorkflow(context, [plugin()])).rejects.toThrow(
    'Release creation failed'
  )

  expect(logger.mock.calls).toContainEqual([
    'A TestHost release could not be rolled back: Rollback failed',
  ])
})
