// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { refreshCargoLock } from '@reelout/cargo'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { temporaryDirectoryTask } from 'tempy'
import { beforeEach, expect, test, vi } from 'vitest'
import { context, logger } from '../../../test/mock/context'

const execCommand = vi.hoisted(() => vi.fn())

const hasCargoCommand = vi.hoisted(() => vi.fn())

vi.mock(import('@reelout/core/util/execCommand'), () => ({
  execCommand: (command: string, args: readonly string[], options: unknown) =>
    execCommand(command, args, options),
}))

vi.mock(import('@reelout/cargo/hasCargoCommand'), () => ({
  hasCargoCommand,
}))

const warnCalls = (): string[] =>
  logger.mock.calls.flatMap(([message]) =>
    typeof message === 'string' ? [message] : []
  )

beforeEach(() => {
  vi.resetAllMocks()
})

test('skips repositories without a lockfile', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd

    await refreshCargoLock(context)

    expect(execCommand).not.toHaveBeenCalled()
  })
})

test('warns when the cargo command is not available', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd

    await writeFile(path.join(cwd, 'Cargo.lock'), '')

    hasCargoCommand.mockResolvedValue(false)

    await refreshCargoLock(context)

    expect(
      warnCalls().some((message) =>
        message.includes(
          'Cargo.lock will not be refreshed: the cargo command is not available.'
        )
      )
    ).toBe(true)
    expect(execCommand).not.toHaveBeenCalled()
  })
})

test('runs cargo update --workspace when a lockfile exists', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd

    await writeFile(path.join(cwd, 'Cargo.lock'), '')

    hasCargoCommand.mockResolvedValue(true)

    await refreshCargoLock(context)

    expect(execCommand.mock.calls).toEqual([
      [
        'cargo',
        ['update', '--workspace'],
        {
          cwd,
          env: {},
          signal: undefined,
          stdout: undefined,
          stderr: undefined,
        },
      ],
    ])
  })
})

test('keeps cargo update output out of CI logs when debug is disabled', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { CI: 'true' }

    await writeFile(path.join(cwd, 'Cargo.lock'), '')

    hasCargoCommand.mockResolvedValue(true)

    await refreshCargoLock(context)

    expect(execCommand.mock.calls[0]?.[2]).toEqual({
      cwd,
      env: { CI: 'true' },
      signal: undefined,
      stdout: undefined,
      stderr: undefined,
    })
  })
})

test('streams cargo update output when attached to a terminal', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    Object.assign(context.stdout, { isTTY: true })

    await writeFile(path.join(cwd, 'Cargo.lock'), '')

    hasCargoCommand.mockResolvedValue(true)

    await refreshCargoLock(context)

    expect(execCommand.mock.calls[0]?.[2]).toEqual({
      cwd,
      env: {},
      signal: undefined,
      stdout: context.stdout,
      stderr: context.stderr,
    })
  })
})

test('streams cargo update output into the CI job log when debug is enabled', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { CI: 'true' }
    context.debug = true

    await writeFile(path.join(cwd, 'Cargo.lock'), '')

    hasCargoCommand.mockResolvedValue(true)

    await refreshCargoLock(context)

    expect(execCommand.mock.calls[0]?.[2]).toEqual({
      cwd,
      env: { CI: 'true' },
      signal: undefined,
      stdout: context.stdout,
      stderr: context.stderr,
    })
  })
})

test('wraps cargo update failures with the lockfile context', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd

    await writeFile(path.join(cwd, 'Cargo.lock'), '')

    hasCargoCommand.mockResolvedValue(true)

    const failure = new Error('mock update failure')

    execCommand.mockRejectedValueOnce(failure)

    const error: unknown = await refreshCargoLock(context).catch((err) => err)

    expect(error).toMatchInlineSnapshot(
      `[Error: Cargo.lock could not be refreshed: 'cargo update --workspace' failed.]`
    )
    expect((error as Error).cause).toBe(failure)
  })
})
