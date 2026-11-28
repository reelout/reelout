// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import '../../../test/mock/env'

import type { Package, ReleasePlan } from '@reelout/core'
import type { PackageManagerInfo } from '@reelout/npm'
import { probePublishedVersion } from '@reelout/npm'
import path from 'node:path'
import { temporaryDirectoryTask } from 'tempy'
import { expect, test, vi } from 'vitest'
import { context } from '../../../test/mock/context'

const execCommand = vi.hoisted(() => vi.fn())

vi.mock(import('@reelout/core/util/execCommand'), () => ({
  execCommand: (command: string, args: readonly string[], options: unknown) =>
    execCommand(command, args, options),
}))

vi.mock(import('@reelout/npm/prepareAuth'), () => ({
  prepareAuth: async () => undefined,
}))

const packageManager = { name: 'npm' } as PackageManagerInfo

const yarnBerryPackageManager = {
  name: 'yarn',
  isYarn: true,
  isYarnBerry: true,
} as PackageManagerInfo

const pkg = { name: 'a', location: 'a' } as Package

const plan = {
  package: pkg,
  history: [],
  release: { type: 'patch', version: '1.2.3' },
} as ReleasePlan

test('drops non-string dist-tag values from the published probe result', async () => {
  execCommand.mockImplementationOnce(async () =>
    JSON.stringify({
      name: 'a',
      version: '1.2.3',
      dist: { tarball: 'https://registry.npmjs.org/a/-/a-1.2.3.tgz' },
      'dist-tags': { latest: 42, next: '2.0.0' },
    })
  )

  const probe = await probePublishedVersion(context, plan, packageManager)

  expect(probe).toEqual({
    status: 'published',
    tarballUrl: 'https://registry.npmjs.org/a/-/a-1.2.3.tgz',
    distTags: { next: '2.0.0' },
  })
})

test('surfaces the recorded integrity value of the published version', async () => {
  execCommand.mockImplementationOnce(async () =>
    JSON.stringify({
      name: 'a',
      version: '1.2.3',
      dist: {
        tarball: 'https://registry.npmjs.org/a/-/a-1.2.3.tgz',
        integrity: 'sha512-recorded-digest',
      },
      'dist-tags': { latest: '1.0.0' },
    })
  )

  const probe = await probePublishedVersion(context, plan, packageManager)

  expect(probe).toEqual({
    status: 'published',
    tarballUrl: 'https://registry.npmjs.org/a/-/a-1.2.3.tgz',
    integrity: 'sha512-recorded-digest',
    distTags: { latest: '1.0.0' },
  })
})

test('omits the tarball URL when the manifest has no dist object', async () => {
  execCommand.mockImplementationOnce(async () =>
    JSON.stringify({
      name: 'a',
      version: '1.2.3',
      'dist-tags': { latest: '1.2.3' },
    })
  )

  const probe = await probePublishedVersion(context, plan, packageManager)

  expect(probe).toEqual({
    status: 'published',
    distTags: { latest: '1.2.3' },
  })
})

test('omits the tarball URL when the dist entry has no string tarball', async () => {
  execCommand.mockImplementationOnce(async () =>
    JSON.stringify({
      name: 'a',
      version: '1.2.3',
      dist: {},
      'dist-tags': { latest: '1.2.3' },
    })
  )

  const probe = await probePublishedVersion(context, plan, packageManager)

  expect(probe).toEqual({
    status: 'published',
    distTags: { latest: '1.2.3' },
  })
})

test('defaults to empty dist-tags when the manifest omits them', async () => {
  execCommand.mockImplementationOnce(async () =>
    JSON.stringify({
      name: 'a',
      version: '1.2.3',
    })
  )

  const probe = await probePublishedVersion(context, plan, packageManager)

  expect(probe).toEqual({
    status: 'published',
    distTags: {},
  })
})

test('passes the publish registry through the environment when probing with Yarn Berry', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd

    execCommand.mockImplementationOnce(async () =>
      JSON.stringify({
        name: 'a',
        version: '1.2.3',
        dist: { tarball: 'https://registry.yarnpkg.com/a/-/a-1.2.3.tgz' },
        'dist-tags': { latest: '1.2.3' },
      })
    )

    const probe = await probePublishedVersion(
      context,
      plan,
      yarnBerryPackageManager
    )

    expect(probe).toEqual({
      status: 'published',
      tarballUrl: 'https://registry.yarnpkg.com/a/-/a-1.2.3.tgz',
      integrity: undefined,
      distTags: { latest: '1.2.3' },
    })

    expect(execCommand).toHaveBeenCalledWith(
      'yarn',
      ['npm', 'info', 'a@1.2.3', '--json'],
      {
        cwd: path.resolve(cwd, 'a'),
        env: { YARN_NPM_REGISTRY_SERVER: 'https://registry.yarnpkg.com/' },
      }
    )
  })
})

test('reports absent when Yarn Berry falls back to the latest manifest', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd

    execCommand.mockImplementationOnce(async () =>
      JSON.stringify({
        name: 'a',
        version: '1.0.0',
        'dist-tags': { latest: '1.0.0' },
      })
    )

    const probe = await probePublishedVersion(
      context,
      plan,
      yarnBerryPackageManager
    )

    expect(probe).toEqual({ status: 'absent' })
  })
})
