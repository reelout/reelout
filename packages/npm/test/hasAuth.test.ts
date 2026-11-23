// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { Package } from '@reelout/core'
import { hasAuth } from '@reelout/npm'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { temporaryDirectoryTask } from 'tempy'
import { expect, test } from 'vitest'
import { context } from '../../../test/mock/context'
import { HOME_DIR } from '../../../test/mock/env'

const pkg1 = { location: '.' } as Package
const pkg2 = { location: '.', name: '@scope/name' } as Package

test('returns true when NPM_ID_TOKEN environment variable is defined', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.env = { NPM_ID_TOKEN: 'mock-token-value' }

    context.cwd = cwd

    expect(await hasAuth(context, pkg1, {})).toBe(true)
  })
})

test('returns true when GitHub Actions ID token request URL and token environment variables are provided', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.env = {
      ACTIONS_ID_TOKEN_REQUEST_URL: 'https://mock.url',
      ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'mock-request-token',
    }

    context.cwd = cwd

    expect(await hasAuth(context, pkg1, {})).toBe(true)
  })
})

test('returns false when local .npmrc configuration file is empty for unscoped package', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd

    const npmrc = path.join(cwd, '.npmrc')

    await writeFile(npmrc, '')

    expect(await hasAuth(context, pkg1, {})).toBe(false)
  })
})

test('returns true when local .npmrc defines an authentication token for the registry', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd

    const npmrc = path.join(cwd, '.npmrc')

    await writeFile(npmrc, '//registry.npmjs.org/:_authToken=${NPM_TOKEN}')

    expect(await hasAuth(context, pkg1, {})).toBe(true)
  })
})

test('returns true when global user .npmrc defines an authentication token for the registry', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    const npmrc = path.join(HOME_DIR, '.npmrc')

    await writeFile(npmrc, '//registry.npmjs.org/:_authToken=${NPM_TOKEN}')

    expect(await hasAuth(context, pkg1, {})).toBe(true)
  })
})

test('returns true when local .npmrc contains legacy base64 encoded _auth credentials', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd

    const npmrc = path.join(cwd, '.npmrc')

    await writeFile(
      npmrc,
      '//registry.npmjs.org/:_auth=dXNlcm5hbWU6cGFzc3dvcmQ='
    )

    expect(await hasAuth(context, pkg1, {})).toBe(true)
  })
})

test('returns true when global user .npmrc contains legacy base64 encoded _auth credentials', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    const npmrc = path.join(HOME_DIR, '.npmrc')

    await writeFile(
      npmrc,
      '//registry.npmjs.org/:_auth=dXNlcm5hbWU6cGFzc3dvcmQ='
    )

    expect(await hasAuth(context, pkg1, {})).toBe(true)
  })
})

test('returns false when local .npmrc defines a registry URL without credentials', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd

    const npmrc = path.join(cwd, '.npmrc')

    await writeFile(npmrc, 'registry=https://npm.pkg.github.com/')

    expect(await hasAuth(context, pkg1, {})).toBe(false)
  })
})

test('returns true when local .npmrc defines both a registry URL and its corresponding auth token', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd

    const npmrc = path.join(cwd, '.npmrc')

    await writeFile(
      npmrc,
      [
        'registry=https://npm.pkg.github.com/',
        '//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}',
      ].join('\n')
    )

    expect(await hasAuth(context, pkg1, {})).toBe(true)
  })
})

test('returns false when local .npmrc configuration file is empty for scoped package', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd

    const npmrc = path.join(cwd, '.npmrc')

    await writeFile(npmrc, '')

    expect(await hasAuth(context, pkg2, {})).toBe(false)
  })
})

test('returns true when evaluating a scoped package against local .npmrc with a default registry auth token', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd

    const npmrc = path.join(cwd, '.npmrc')

    await writeFile(npmrc, '//registry.npmjs.org/:_authToken=${NPM_TOKEN}')

    expect(await hasAuth(context, pkg2, {})).toBe(true)
  })
})

test('returns false when evaluating a scoped package against local .npmrc registry URL missing credentials', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd

    const npmrc = path.join(cwd, '.npmrc')

    await writeFile(npmrc, 'registry=https://npm.pkg.github.com/')

    expect(await hasAuth(context, pkg2, {})).toBe(false)
  })
})

test('returns true when evaluating a scoped package against local .npmrc registry URL with a matching auth token', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd

    const npmrc = path.join(cwd, '.npmrc')

    await writeFile(
      npmrc,
      [
        'registry=https://npm.pkg.github.com/',
        '//npm.pkg.github.com/:_authToken=${NPM_TOKEN}',
      ].join('\n')
    )

    expect(await hasAuth(context, pkg2, {})).toBe(true)
  })
})

test('returns false when scoped package encounters a scope-specific registry mapping lacking an auth token', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd

    const npmrc = path.join(cwd, '.npmrc')

    await writeFile(npmrc, '@scope:registry=https://npm.pkg.github.com/')

    expect(await hasAuth(context, pkg2, {})).toBe(false)
  })
})

test('returns true when scoped package scope mapping matches a registry with a valid auth token', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd

    const npmrc = path.join(cwd, '.npmrc')

    await writeFile(
      npmrc,
      [
        '@scope:registry=https://npm.pkg.github.com/',
        '//npm.pkg.github.com/:_authToken=${NPM_TOKEN}',
      ].join('\n')
    )

    expect(await hasAuth(context, pkg2, {})).toBe(true)
  })
})
