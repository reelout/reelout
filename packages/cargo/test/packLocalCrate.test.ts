// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { packLocalCrate, type CompleteCargoReleasePlan } from '@reelout/cargo'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { beforeEach, expect, test, vi } from 'vitest'
import { context } from '../../../test/mock/context'

const execCommand = vi.hoisted(() => vi.fn())

vi.mock(import('@reelout/core/util/execCommand'), () => ({
  execCommand: (command: string, args: readonly string[], options: unknown) =>
    execCommand(command, args, options),
}))

const plan: CompleteCargoReleasePlan = {
  package: {
    provider: '@reelout/cargo',
    name: 'a',
    version: '1.2.2',
    private: false,
    root: true,
    entry: true,
    dependencies: [],
    location: '.',
  },
  history: [],
  release: { type: 'patch', version: '1.2.3' },
}

const packCrates = (count: number) =>
  execCommand.mockImplementationOnce(
    async (command: string, args: readonly string[]) => {
      const targetDir = args[args.indexOf('--target-dir') + 1]

      if (targetDir === undefined) {
        throw new Error('No --target-dir flag found')
      }

      const packageDir = path.join(targetDir, 'package')

      await mkdir(packageDir, { recursive: true })

      for (let index = 0; index < count; index += 1) {
        await writeFile(
          path.join(packageDir, `a-${index}.crate`),
          'packed-crate'
        )
      }
    }
  )

beforeEach(() => {
  vi.resetAllMocks()
})

test('returns the single packed crate', async () => {
  packCrates(1)

  const crate = await packLocalCrate(context, plan)

  expect(crate.equals(Buffer.from('packed-crate'))).toBe(true)

  expect(execCommand.mock.calls[0]?.slice(0, 2)).toEqual([
    'cargo',
    [
      'package',
      '--no-verify',
      '--allow-dirty',
      '-p',
      'a',
      '--target-dir',
      expect.any(String),
    ],
  ])
})

test('throws when the pack produced no crate', async () => {
  packCrates(0)

  await expect(packLocalCrate(context, plan)).rejects.toThrow(
    /^A single packed crate was expected in ".*", found 0\.$/
  )
})

test('throws when the pack produced more than one crate', async () => {
  packCrates(2)

  await expect(packLocalCrate(context, plan)).rejects.toThrow(
    /^A single packed crate was expected in ".*", found 2\.$/
  )
})
