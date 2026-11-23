// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { Package } from '@reelout/core'
import type { PackageManagerInfo } from '@reelout/npm'
import { prepareAuth } from '@reelout/yarn'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { temporaryDirectoryTask } from 'tempy'
import { expect, test } from 'vitest'
import { context } from '../../../test/mock/context'

const pkg1 = { location: '.' } as Package

const yarn1 = { isYarnClassic: true } as PackageManagerInfo

const yarn2 = { isYarnBerry: true } as PackageManagerInfo

test('returns undefined when NPM_TOKEN environment variable is absent', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd

    expect(await prepareAuth(context, pkg1, yarn1)).toBeUndefined()
    expect(await prepareAuth(context, pkg1, yarn2)).toBeUndefined()
  })
})

test('skips injection when ambient registry authentication already exists', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd

    context.env = { NPM_TOKEN: 'mock-npm-token' }

    const npmrc = path.join(cwd, '.npmrc')

    await writeFile(npmrc, '//registry.npmjs.org/:_authToken=mock-npm-token')

    expect(await prepareAuth(context, pkg1, yarn1)).toBeUndefined()
  })
})

test('returns npm configuration environment variables when Yarn Classic is active', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd

    context.env = { NPM_TOKEN: 'mock-npm-token' }

    await using env = await prepareAuth(context, pkg1, yarn1)

    expect(env).toMatchInlineSnapshot(`
      {
        "npm_config_//registry.npmjs.org/:_authToken": "mock-npm-token",
      }
    `)
  })
})

test('returns YARN_NPM_AUTH_TOKEN environment variable when Yarn Berry is active', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd

    context.env = { NPM_TOKEN: 'mock-npm-token' }

    await using env = await prepareAuth(context, pkg1, yarn2)

    expect(env).toMatchInlineSnapshot(`
      {
        "YARN_NPM_AUTH_TOKEN": "mock-npm-token",
      }
    `)
  })
})
