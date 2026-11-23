// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { resolveCargoToken } from '@reelout/cargo'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { temporaryDirectoryTask } from 'tempy'
import { beforeEach, expect, test, vi } from 'vitest'
import { context } from '../../../test/mock/context'

const osHome = vi.hoisted(() => ({ dir: '' }))

vi.mock('node:os', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  homedir: () => osHome.dir,
}))

const writeCredentials = async (home: string, credentials: string) => {
  await mkdir(path.join(home, '.cargo'), { recursive: true })
  await writeFile(
    path.join(home, '.cargo', 'credentials.toml'),
    `${credentials}\n`
  )
}

beforeEach(() => {
  vi.resetAllMocks()
})

test('prefers the CARGO_REGISTRY_TOKEN environment variable', async () => {
  context.env = { CARGO_REGISTRY_TOKEN: '  mock-registry-token  ' }

  await expect(resolveCargoToken(context)).resolves.toBe('mock-registry-token')
})

test('falls back to the cargo credentials file', async () => {
  await temporaryDirectoryTask(async (home) => {
    context.env = { HOME: home }

    await writeCredentials(home, '[registry]\ntoken = "credentials-token"')

    await expect(resolveCargoToken(context)).resolves.toBe('credentials-token')
  })
})

test('prefers CARGO_HOME for the credentials file', async () => {
  await temporaryDirectoryTask(async (cargoHome) => {
    context.env = { CARGO_HOME: cargoHome, HOME: '/nonexistent' }

    await mkdir(cargoHome, { recursive: true })
    await writeFile(
      path.join(cargoHome, 'credentials.toml'),
      '[registry]\ntoken = "credentials-token"\n'
    )

    await expect(resolveCargoToken(context)).resolves.toBe('credentials-token')
  })
})

test('falls back to the system home directory', async () => {
  await temporaryDirectoryTask(async (mockHome) => {
    osHome.dir = mockHome

    context.env = {}

    await writeCredentials(mockHome, '[registry]\ntoken = "credentials-token"')

    await expect(resolveCargoToken(context)).resolves.toBe('credentials-token')
  })
})

test('returns undefined when the credentials file has no registry table', async () => {
  await temporaryDirectoryTask(async (home) => {
    context.env = { HOME: home }

    await writeCredentials(home, '[other]\nkey = "value"')

    await expect(resolveCargoToken(context)).resolves.toBe(undefined)
  })
})

test('returns undefined without credentials', async () => {
  await temporaryDirectoryTask(async (home) => {
    context.env = { HOME: home }

    await expect(resolveCargoToken(context)).resolves.toBe(undefined)
  })
})

test('returns undefined when the credentials file is invalid TOML', async () => {
  await temporaryDirectoryTask(async (home) => {
    context.env = { HOME: home }

    await writeCredentials(home, 'not = [valid')

    await expect(resolveCargoToken(context)).resolves.toBe(undefined)
  })
})

test('returns undefined for whitespace-only tokens', async () => {
  await temporaryDirectoryTask(async (home) => {
    context.env = { CARGO_REGISTRY_TOKEN: '   ', HOME: home }

    await writeCredentials(home, '[registry]\ntoken = "   "')

    await expect(resolveCargoToken(context)).resolves.toBe(undefined)
  })
})

test('returns undefined for non-string tokens', async () => {
  await temporaryDirectoryTask(async (home) => {
    context.env = { HOME: home }

    await writeCredentials(home, '[registry]\ntoken = 123')

    await expect(resolveCargoToken(context)).resolves.toBe(undefined)
  })
})
