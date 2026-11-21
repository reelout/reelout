// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { Package, ReleasePlan } from '@reelout/core'
import type { PackageManagerInfo } from '@reelout/npm'
import { packLocalTarball } from '@reelout/npm'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { beforeEach, expect, test, vi } from 'vitest'
import { context } from '../../../test/mock/context'

const execCommand = vi.hoisted(() => vi.fn())

vi.mock(import('@reelout/core/util/execCommand'), () => ({
  execCommand: (command: string, args: readonly string[], options: unknown) =>
    execCommand(command, args, options),
}))

const pkg = { location: '.' } as Package

const plan = { package: pkg, history: [], release: null } as ReleasePlan

const npm = { name: 'npm' } as PackageManagerInfo

beforeEach(() => {
  execCommand.mockImplementation(async () => {})
})

test('throws when the pack command produces no tarball', async () => {
  await expect(packLocalTarball(context, plan, npm)).rejects.toThrow(
    /^A single packed tarball was expected in ".*", found 0\.$/
  )
})

test('throws when the pack command produces multiple tarballs', async () => {
  execCommand.mockImplementation(async (_command, args) => {
    const destination = args[args.indexOf('--pack-destination') + 1]

    await writeFile(path.join(destination, 'one.tgz'), 'one')
    await writeFile(path.join(destination, 'two.tgz'), 'two')
  })

  await expect(packLocalTarball(context, plan, npm)).rejects.toThrow(
    /^A single packed tarball was expected in ".*", found 2\.$/
  )
})
