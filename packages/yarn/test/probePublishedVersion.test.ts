// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import '../../../test/mock/env'

import type { Package, ReleasePlan } from '@reelout/core'
import type { PackageManagerInfo } from '@reelout/npm'
import { probePublishedVersion } from '@reelout/yarn'
import { expect, test, vi } from 'vitest'
import { context } from '../../../test/mock/context'

const execCommand = vi.hoisted(() => vi.fn())

vi.mock(import('@reelout/core/util/execCommand'), () => ({
  execCommand: (command: string, args: readonly string[], options: unknown) =>
    execCommand(command, args, options),
}))

vi.mock(import('@reelout/yarn/prepareAuth'), () => ({
  prepareAuth: async () => undefined,
}))

const yarnClassic = { isYarnClassic: true } as PackageManagerInfo

const yarnBerry = { isYarnBerry: true } as PackageManagerInfo

const pkg = { name: 'a', location: 'a' } as Package

const plan = {
  package: pkg,
  history: [],
  release: { type: 'patch', version: '1.2.3' },
} as ReleasePlan

const publishedManifest = (
  distTags: Record<string, unknown> = { latest: '1.0.0' },
  integrity?: string
): string =>
  JSON.stringify({
    name: 'a',
    version: '1.2.3',
    dist: { tarball: 'https://registry.npmjs.org/a/-/a-1.2.3.tgz', integrity },
    'dist-tags': distTags,
  })

test('probes with yarn npm info under Yarn Berry', async () => {
  execCommand.mockImplementationOnce(async () => publishedManifest())

  await probePublishedVersion(context, plan, yarnBerry)

  expect(execCommand).toHaveBeenCalledWith(
    'yarn',
    ['npm', 'info', 'a@1.2.3', '--json'],
    expect.objectContaining({ cwd: '/repo/a' })
  )
})

test('probes with npm view and the resolved registry under Yarn Classic', async () => {
  execCommand.mockImplementationOnce(async () => publishedManifest())

  await probePublishedVersion(context, plan, yarnClassic)

  expect(execCommand).toHaveBeenCalledWith(
    'npm',
    ['view', 'a@1.2.3', '--json', '--registry', 'https://registry.npmjs.org/'],
    expect.objectContaining({ cwd: '/repo/a' })
  )
})

test('reports the version as absent on an npm E404 response', async () => {
  execCommand.mockRejectedValueOnce(
    new Error(
      `Command 'npm view a@1.2.3 --json --registry https://registry.npmjs.org/' failed (exit code 1)
npm error code E404
npm error 404 No match found for version 1.2.3`
    )
  )

  expect(await probePublishedVersion(context, plan, yarnClassic)).toEqual({
    status: 'absent',
  })
})

test('reports the version as absent on a Yarn Berry 404 response', async () => {
  execCommand.mockRejectedValueOnce(
    new Error(
      `Command 'yarn npm info a@1.2.3 --json' failed (exit code 1)
Response Code: 404`
    )
  )

  expect(await probePublishedVersion(context, plan, yarnBerry)).toEqual({
    status: 'absent',
  })
})

test('reports the version as absent on a Not Found - 404 response', async () => {
  execCommand.mockRejectedValueOnce(new Error('Not Found - 404'))

  expect(await probePublishedVersion(context, plan, yarnBerry)).toEqual({
    status: 'absent',
  })
})

test('reports the version as absent when Yarn Berry falls back to a different version manifest', async () => {
  execCommand.mockImplementationOnce(async () =>
    JSON.stringify({
      name: 'a',
      version: '2.1.3',
      dist: { tarball: 'https://registry.npmjs.org/a/-/a-2.1.3.tgz' },
      'dist-tags': { latest: '2.1.3' },
      versions: ['1.0.0', '2.1.3'],
    })
  )

  expect(await probePublishedVersion(context, plan, yarnBerry)).toEqual({
    status: 'absent',
  })
})

test('drops non-string dist-tag values from the published probe result', async () => {
  execCommand.mockImplementationOnce(async () =>
    publishedManifest({ latest: 42, next: '2.0.0' })
  )

  const probe = await probePublishedVersion(context, plan, yarnBerry)

  expect(probe).toEqual({
    status: 'published',
    tarballUrl: 'https://registry.npmjs.org/a/-/a-1.2.3.tgz',
    distTags: { next: '2.0.0' },
  })
})

test('surfaces the recorded integrity value of the published version', async () => {
  execCommand.mockImplementationOnce(async () =>
    publishedManifest({ latest: '1.0.0' }, 'sha512-recorded-digest')
  )

  const probe = await probePublishedVersion(context, plan, yarnBerry)

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

  const probe = await probePublishedVersion(context, plan, yarnBerry)

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

  const probe = await probePublishedVersion(context, plan, yarnBerry)

  expect(probe).toEqual({
    status: 'published',
    distTags: {},
  })
})

test('propagates probe failures that do not report not found', async () => {
  execCommand.mockRejectedValueOnce(new Error('network unreachable'))

  await expect(probePublishedVersion(context, plan, yarnBerry)).rejects.toThrow(
    'network unreachable'
  )
})

test('propagates unparseable registry metadata', async () => {
  execCommand.mockImplementationOnce(async () => 'not-json')

  await expect(probePublishedVersion(context, plan, yarnBerry)).rejects.toThrow(
    'Registry metadata for "a@1.2.3" could not be parsed: Unexpected token'
  )
})
