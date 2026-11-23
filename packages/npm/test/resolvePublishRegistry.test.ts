// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { Package } from '@reelout/core'
import { resolvePublishRegistry, writePackageJson } from '@reelout/npm'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { temporaryDirectoryTask } from 'tempy'
import { expect, test } from 'vitest'
import { context } from '../../../test/mock/context'
import { HOME_DIR } from '../../../test/mock/env'

const pkg1 = { location: '.' } as Package
const pkg2 = { location: '.', name: '@scope/name' } as Package
const NPMJS = 'https://registry.npmjs.org/'
const GITHUB = 'https://npm.pkg.github.com/'
const NPMMIRROR = 'https://registry.npmmirror.com/'

test('returns default npmjs registry when no configuration exists', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd

    expect(await resolvePublishRegistry(context, pkg1, {})).toBe(NPMJS)
  })
})

test('returns registry defined in package.json publishConfig', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd

    await writePackageJson(cwd, { publishConfig: { registry: GITHUB } })

    expect(await resolvePublishRegistry(context, pkg1, {})).toBe(GITHUB)
  })
})

test('falls back to default npmjs registry when package.json publishConfig registry is empty or invalid', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd

    await writePackageJson(cwd, {})

    expect(await resolvePublishRegistry(context, pkg1, {})).toBe(NPMJS)

    await writePackageJson(cwd, { publishConfig: { registry: 'invalid' } })

    expect(await resolvePublishRegistry(context, pkg1, {})).toBe(NPMJS)
  })
})

test('returns registry defined in local project .npmrc', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd

    const npmrc = path.join(cwd, '.npmrc')

    await writeFile(npmrc, `registry=${GITHUB}`)

    expect(await resolvePublishRegistry(context, pkg1, {})).toBe(GITHUB)
  })
})

test('returns registry defined in user home .npmrc when local .npmrc is absent', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd

    const npmrc = path.join(HOME_DIR, '.npmrc')

    await writeFile(npmrc, `registry=${GITHUB}`)

    expect(await resolvePublishRegistry(context, pkg1, {})).toBe(GITHUB)
  })
})

test('falls back to default npmjs registry when .npmrc registry value is empty or invalid', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd

    const npmrc = path.join(cwd, '.npmrc')

    await writeFile(npmrc, 'registry=')

    expect(await resolvePublishRegistry(context, pkg1, {})).toBe(NPMJS)

    await writeFile(npmrc, 'registry=invalid')

    expect(await resolvePublishRegistry(context, pkg1, {})).toBe(NPMJS)
  })
})

test('returns scope-specific registry from .npmrc when package includes a scope', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd

    const npmrc = path.join(cwd, '.npmrc')

    await writeFile(npmrc, `registry=${GITHUB}\n@scope:registry=${NPMMIRROR}`)

    expect(await resolvePublishRegistry(context, pkg2, {})).toBe(NPMMIRROR)
  })
})

test('falls back to global .npmrc registry when package scope lacks explicit configuration', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd

    const npmrc = path.join(cwd, '.npmrc')

    await writeFile(npmrc, `registry=${GITHUB}`)

    expect(await resolvePublishRegistry(context, pkg2, {})).toBe(GITHUB)
  })
})

test('falls back to global .npmrc registry when scope-specific registry is empty or invalid', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd

    const npmrc = path.join(cwd, '.npmrc')

    await writeFile(npmrc, `registry=${GITHUB}\n@scope:registry=`)

    expect(await resolvePublishRegistry(context, pkg2, {})).toBe(GITHUB)

    await writeFile(npmrc, `registry=${GITHUB}\n@scope:registry=invalid`)

    expect(await resolvePublishRegistry(context, pkg2, {})).toBe(GITHUB)
  })
})
