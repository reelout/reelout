// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { Package, ReleasePlan } from '@reelout/core'
import type { PackageManagerInfo } from '@reelout/npm'
import { packLocalTarball } from '@reelout/yarn'
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

const yarnClassic = { isYarnClassic: true } as PackageManagerInfo

const yarnBerry = { isYarnBerry: true } as PackageManagerInfo

beforeEach(() => {
  execCommand.mockImplementation(async () => {})
})

test('packs the package with --out under Yarn Berry', async () => {
  execCommand.mockImplementation(async (_command, args) => {
    expect(args[0]).toBe('pack')
    expect(args[1]).toBe('--out')

    await writeFile(args[2], 'packed-tarball')

    return ''
  })

  const tarball = await packLocalTarball(context, plan, yarnBerry)

  expect(tarball.equals(Buffer.from('packed-tarball'))).toBe(true)
})

test('packs the package with --filename under Yarn Classic', async () => {
  execCommand.mockImplementation(async (_command, args) => {
    expect(args[0]).toBe('pack')
    expect(args[1]).toBe('--filename')

    await writeFile(args[2], 'packed-tarball')

    return ''
  })

  const tarball = await packLocalTarball(context, plan, yarnClassic)

  expect(tarball.equals(Buffer.from('packed-tarball'))).toBe(true)
})

test('throws when the pack command produces no tarball', async () => {
  await expect(packLocalTarball(context, plan, yarnBerry)).rejects.toThrow(
    /^A single packed tarball was expected in ".*", found 0\.$/
  )
})

test('throws when the pack command produces multiple tarballs', async () => {
  execCommand.mockImplementation(async (_command, args) => {
    const destination = path.dirname(args[2])

    await writeFile(path.join(destination, 'one.tgz'), 'one')
    await writeFile(path.join(destination, 'two.tgz'), 'two')
  })

  await expect(packLocalTarball(context, plan, yarnBerry)).rejects.toThrow(
    /^A single packed tarball was expected in ".*", found 2\.$/
  )
})
