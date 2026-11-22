// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { ReleasePlan } from '@reelout/core'
import { publishCrate } from '@reelout/cargo'
import { beforeEach, expect, test, vi } from 'vitest'
import { context } from '../../../test/mock/context'

const execCommand = vi.hoisted(() => vi.fn())

vi.mock(import('@reelout/core/util/execCommand'), () => ({
  execCommand: (command: string, args: readonly string[], options: unknown) =>
    execCommand(command, args, options),
}))

interface CreatePlanOptions {
  name?: string | undefined
  private?: boolean | undefined
  releaseVersion?: string | null | undefined
}

function createPlan(options: CreatePlanOptions = {}): ReleasePlan {
  return {
    package: {
      provider: '@reelout/cargo',
      name: options.name,
      version: '1.2.2',
      private: options.private ?? false,
      root: true,
      entry: true,
      dependencies: [],
      location: '.',
    },
    history: [],
    release:
      options.releaseVersion == null
        ? null
        : { type: 'patch', version: options.releaseVersion },
  }
}

beforeEach(() => {
  vi.resetAllMocks()
})

test('skips private crates', async () => {
  await publishCrate(context, createPlan({ name: 'a', private: true }), {})

  expect(execCommand).not.toHaveBeenCalled()
})

test('skips unnamed crates', async () => {
  await publishCrate(context, createPlan({ name: undefined }), {})

  expect(execCommand).not.toHaveBeenCalled()
})

test('skips crates without a release version', async () => {
  await publishCrate(context, createPlan({ name: 'a', releaseVersion: null }))

  expect(execCommand).not.toHaveBeenCalled()
})

test('publishes a crate with cargo publish', async () => {
  await publishCrate(
    context,
    createPlan({ name: 'a', releaseVersion: '1.2.3' }),
    {}
  )

  expect(execCommand.mock.calls).toEqual([
    [
      'cargo',
      ['publish', '-p', 'a'],
      {
        cwd: '/repo',
        env: {},
        signal: undefined,
        stdout: undefined,
        stderr: undefined,
      },
    ],
  ])
})

test('forwards the dry-run, allow-dirty, and no-verify flags', async () => {
  await publishCrate(
    context,
    createPlan({ name: 'a', releaseVersion: '1.2.3' }),
    {
      dryRun: true,
      allowDirty: true,
      noVerify: true,
    }
  )

  expect(execCommand.mock.calls[0]?.slice(0, 2)).toEqual([
    'cargo',
    ['publish', '-p', 'a', '--dry-run', '--allow-dirty', '--no-verify'],
  ])
})

test('injects the trusted-publishing registry token into the environment', async () => {
  context.env = { CARGO_HOME: '/cargo-home' }

  await publishCrate(
    context,
    createPlan({ name: 'a', releaseVersion: '1.2.3' }),
    { registryToken: 'mock-publish-token' }
  )

  expect(execCommand.mock.calls[0]?.[2]).toEqual({
    cwd: '/repo',
    env: {
      CARGO_HOME: '/cargo-home',
      CARGO_REGISTRY_TOKEN: 'mock-publish-token',
    },
    signal: undefined,
    stdout: undefined,
    stderr: undefined,
  })
})

test('forwards output streams in loud environments', async () => {
  context.env = { CI: 'true' }

  await publishCrate(
    context,
    createPlan({ name: 'a', releaseVersion: '1.2.3' }),
    {}
  )

  expect(execCommand.mock.calls[0]?.[2]).toEqual({
    cwd: '/repo',
    env: { CI: 'true' },
    signal: undefined,
    stdout: context.stdout,
    stderr: context.stderr,
  })
})
