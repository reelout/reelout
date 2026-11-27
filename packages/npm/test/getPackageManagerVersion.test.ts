// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { getPackageManagerVersion } from '@reelout/npm'
import { beforeEach, expect, test, vi } from 'vitest'

const execCommand = vi.hoisted(() => vi.fn())

vi.mock(import('@reelout/core/util/execCommand'), () => ({
  execCommand: (command, args, options) => execCommand(command, args, options),
}))

beforeEach(() => {
  vi.resetAllMocks()
})

test('retrieves the major version from the package manager output', async () => {
  execCommand.mockResolvedValueOnce('11.10.1\n')
  execCommand.mockResolvedValueOnce('10.30.1\n')
  execCommand.mockResolvedValueOnce('1.22.22\n')
  execCommand.mockResolvedValueOnce('4.12.0\n')

  expect(await getPackageManagerVersion('/repo', 'npm')).toBe(11)
  expect(await getPackageManagerVersion('/repo', 'pnpm')).toBe(10)
  expect(await getPackageManagerVersion('/repo', 'yarn')).toBe(1)
  expect(await getPackageManagerVersion('/repo', 'yarn')).toBe(4)

  expect(execCommand.mock.calls).toMatchInlineSnapshot(`
    [
      [
        "npm",
        [
          "-v",
        ],
        {
          "cwd": "/repo",
        },
      ],
      [
        "pnpm",
        [
          "-v",
        ],
        {
          "cwd": "/repo",
        },
      ],
      [
        "yarn",
        [
          "-v",
        ],
        {
          "cwd": "/repo",
        },
      ],
      [
        "yarn",
        [
          "-v",
        ],
        {
          "cwd": "/repo",
        },
      ],
    ]
  `)
})

test('passes execution options through to the version command', async () => {
  execCommand.mockResolvedValue('4.12.0\n')

  const signal = AbortSignal.abort()

  expect(
    await getPackageManagerVersion('/repo', 'yarn', { env: {}, signal })
  ).toBe(4)

  expect(execCommand).toHaveBeenCalledWith('yarn', ['-v'], {
    env: {},
    signal,
    cwd: '/repo',
  })
})

test('returns undefined when the version output is not semver', async () => {
  execCommand.mockResolvedValue('not-a-version\n')

  expect(await getPackageManagerVersion('/repo', 'yarn')).toBe(undefined)
})

test('returns undefined when the version command fails', async () => {
  execCommand.mockRejectedValue(new Error('spawn yarn ENOENT'))

  expect(await getPackageManagerVersion('/repo', 'yarn')).toBe(undefined)
})
