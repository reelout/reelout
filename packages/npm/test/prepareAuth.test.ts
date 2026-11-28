// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import '../../../test/mock/env'

import Config from '@npmcli/config'
import type { Package } from '@reelout/core'
import { prepareAuth } from '@reelout/npm'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { temporaryDirectoryTask } from 'tempy'
import { beforeEach, expect, test, vi } from 'vitest'
import { context, logger } from '../../../test/mock/context'

vi.mock(import('@npmcli/config'), async (importActual) => importActual())

const pkg1 = { location: '.' } as Package

beforeEach(() => {
  vi.spyOn(Config.prototype, 'set')
  vi.spyOn(Config.prototype, 'save')
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
        "NPM_AUTH_TOKEN": "mock-npm-token",
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

test('skips YARN_NPM_AUTH_TOKEN injection when the publish registry is outside the Yarn defaults', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd

    context.env = { NPM_TOKEN: 'mock-npm-token' }

    await writeFile(
      path.join(cwd, 'package.json'),
      JSON.stringify({
        name: 'a',
        version: '1.2.3',
        publishConfig: { registry: 'https://npm.pkg.github.com' },
      })
    )

    expect(
      await prepareAuth(context, pkg1, { isYarnBerry: true })
    ).toBeUndefined()

    expect(
      logger.mock.calls.filter(
        ([message]) =>
          typeof message === 'string' &&
          message.includes(
            'NPM_TOKEN was not injected for "https://npm.pkg.github.com/": Yarn Berry would apply it to every registry without its own credentials.'
          )
      )
    ).toHaveLength(1)
  })
})

test('warns about an unmatched publish registry only once per registry', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd

    context.env = { NPM_TOKEN: 'mock-npm-token' }

    await writeFile(
      path.join(cwd, 'package.json'),
      JSON.stringify({
        name: 'a',
        version: '1.2.3',
        publishConfig: { registry: 'https://registry.npmmirror.com' },
      })
    )

    expect(
      await prepareAuth(context, pkg1, { isYarnBerry: true })
    ).toBeUndefined()

    expect(
      await prepareAuth(context, pkg1, { isYarnBerry: true })
    ).toBeUndefined()

    expect(
      logger.mock.calls.filter(
        ([message]) =>
          typeof message === 'string' &&
          message.includes(
            'NPM_TOKEN was not injected for "https://registry.npmmirror.com/": Yarn Berry would apply it to every registry without its own credentials.'
          )
      )
    ).toHaveLength(1)
  })
})

test('returns YARN_NPM_AUTH_TOKEN when the publish registry matches the configured Yarn registry', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd

    context.env = { NPM_TOKEN: 'mock-npm-token' }

    await writeFile(
      path.join(cwd, 'package.json'),
      JSON.stringify({
        name: 'a',
        version: '1.2.3',
        publishConfig: { registry: 'https://npm.pkg.github.com' },
      })
    )

    await writeFile(
      path.join(cwd, '.yarnrc.yml'),
      'npmRegistryServer: https://npm.pkg.github.com\n'
    )

    await using env = await prepareAuth(context, pkg1, { isYarnBerry: true })

    expect(env).toMatchInlineSnapshot(`
      {
        "YARN_NPM_AUTH_TOKEN": "mock-npm-token",
      }
    `)

    expect(
      logger.mock.calls.filter(
        ([message]) =>
          typeof message === 'string' &&
          message.includes('NPM_TOKEN was not injected for')
      )
    ).toHaveLength(0)
  })
})
