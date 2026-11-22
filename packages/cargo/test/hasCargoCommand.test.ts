// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { hasCargoCommand } from '@reelout/cargo'
import { beforeEach, expect, test, vi } from 'vitest'
import { context } from '../../../test/mock/context'

const execCommand = vi.hoisted(() => vi.fn())

vi.mock(import('@reelout/core/util/execCommand'), () => ({
  execCommand: (command: string, args: readonly string[], options: unknown) =>
    execCommand(command, args, options),
}))

beforeEach(() => {
  vi.resetAllMocks()
})

test('runs cargo --version and returns true when the command succeeds', async () => {
  execCommand.mockResolvedValueOnce('cargo 1.85.0')

  expect(await hasCargoCommand(context)).toBe(true)

  expect(execCommand.mock.calls).toEqual([
    ['cargo', ['--version'], { cwd: '/repo', env: {}, signal: undefined }],
  ])
})

test('returns false when the cargo command is not available', async () => {
  execCommand.mockRejectedValueOnce(new Error('spawn cargo ENOENT'))

  expect(await hasCargoCommand(context)).toBe(false)
})
