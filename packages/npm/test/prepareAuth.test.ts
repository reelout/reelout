// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import '../../../test/mock/env'

import Config from '@npmcli/config'
import type { Package } from '@reelout/core'
import { prepareAuth } from '@reelout/npm'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { temporaryDirectoryTask } from 'tempy'
import { afterEach, expect, test, vi } from 'vitest'
import { context } from '../../../test/mock/context'

vi.mock(import('@npmcli/config'), async (importActual) => {
  const { default: Config, ...mod } = await importActual()

  vi.spyOn(Config.prototype, 'set')
  vi.spyOn(Config.prototype, 'save')

  return { ...mod, default: Config }
})

const pkg1 = { location: '.' } as Package

afterEach(() => {
  vi.resetAllMocks()
  vi.unstubAllEnvs()
})

test('returns undefined when NPM_TOKEN environment variable is absent and authentication does not exist', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd

    vi.stubEnv('NPM_TOKEN', undefined)

    expect(await prepareAuth(context, pkg1, {})).toBeUndefined()
  })
})

test('returns undefined when NPM_TOKEN contains only whitespace and authentication does not exist', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd

    context.env = { NPM_TOKEN: '   ' }

    expect(await prepareAuth(context, pkg1, {})).toBeUndefined()
  })
})

test('skips configuration when authentication already exists', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd

    context.env = { NPM_TOKEN: 'mock-npm-token' }

    const npmrc = path.join(cwd, '.npmrc')

    await writeFile(npmrc, '//registry.npmjs.org/:_authToken=mock-npm-token')

    await prepareAuth(context, pkg1, {})

    expect(Config.prototype.set).not.toHaveBeenCalled()
    expect(Config.prototype.save).not.toHaveBeenCalled()
    expect(await readFile(npmrc, 'utf-8')).toMatchInlineSnapshot(
      `"//registry.npmjs.org/:_authToken=mock-npm-token"`
    )
  })
})

test('returns npm configuration environment variables when package manager is npm', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd

    context.env = { NPM_TOKEN: 'mock-npm-token' }

    await using env = await prepareAuth(context, pkg1, { isNpm: true })

    expect(env).toMatchInlineSnapshot(`
      {
        "npm_config_//registry.npmjs.org/:_authToken": "mock-npm-token",
      }
    `)
  })
})

test('returns pnpm configuration environment variables when package manager is pnpm', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd

    context.env = { NPM_TOKEN: 'mock-npm-token' }

    await using env = await prepareAuth(context, pkg1, { isPnpm: true })

    expect(env).toMatchInlineSnapshot(`
      {
        "pnpm_config_//registry.npmjs.org/:_authToken": "mock-npm-token",
      }
    `)
  })
})

test('returns npm configuration environment variables when package manager is classic yarn', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd

    context.env = { NPM_TOKEN: 'mock-npm-token' }

    await using env = await prepareAuth(context, pkg1, { isYarnClassic: true })

    expect(env).toMatchInlineSnapshot(`
      {
        "npm_config_//registry.npmjs.org/:_authToken": "mock-npm-token",
      }
    `)
  })
})

test('returns YARN_NPM_AUTH_TOKEN environment variable when package manager is yarn berry', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd

    context.env = { NPM_TOKEN: 'mock-npm-token' }

    await using env = await prepareAuth(context, pkg1, { isYarnBerry: true })

    expect(env).toMatchInlineSnapshot(`
      {
        "YARN_NPM_AUTH_TOKEN": "mock-npm-token",
      }
    `)
  })
})
