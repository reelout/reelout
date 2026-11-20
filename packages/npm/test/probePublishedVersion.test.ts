// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import '../../../test/mock/env'

import type { Package, ReleasePlan } from '@reelout/core'
import type { PackageManagerInfo } from '@reelout/npm'
import { probePublishedVersion } from '@reelout/npm'
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
