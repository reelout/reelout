// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import '../../../test/mock/env'

import type { Package, ReleasePlan } from '@reelout/core'
import type { PackageManagerInfo } from '@reelout/npm'
import { downloadPublishedTarball } from '@reelout/npm'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { temporaryDirectoryTask } from 'tempy'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { context } from '../../../test/mock/context'
import { HOME_DIR } from '../../../test/mock/env'

const fetchMock = vi.hoisted(() => vi.fn())

const loadConfig = vi.hoisted(() => vi.fn())

const loadYarnConfig = vi.hoisted(() => vi.fn())

vi.mock(import('@reelout/npm/loadConfig'), async (importActual) => ({
  loadConfig: async (...args) =>
    loadConfig(...args) ?? (await importActual()).loadConfig(...args),
}))

vi.mock(import('@reelout/npm/loadYarnConfig'), async (importActual) => ({
  loadYarnConfig: async (...args) =>
    loadYarnConfig(...args) ?? (await importActual()).loadYarnConfig(...args),
}))

const pkg = { location: '.' } as Package

const plan = { package: pkg, history: [], release: null } as ReleasePlan

const scopedPkg = { location: '.', name: '@mock-scope/a' } as Package

const scopedPlan = {
  package: scopedPkg,
  history: [],
  release: null,
} as ReleasePlan

const npm = { isNpm: true } as PackageManagerInfo

const yarnBerry = { isYarnBerry: true } as PackageManagerInfo

const TARBALL_URL = 'https://registry.npmjs.org/a/-/a-1.2.3.tgz'

const mockSuccessfulResponse = (content: string) =>
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    arrayBuffer: async () => new TextEncoder().encode(content).buffer,
  })

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('fetch', (...args: unknown[]) => fetchMock(...args))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

test('downloads the published tarball with ambient registry credentials', async () => {
  await writeFile(
    path.join(HOME_DIR, '.npmrc'),
    '//registry.npmjs.org/:_authToken=mock-ambient-token'
  )

  mockSuccessfulResponse('published-tarball')

  const tarball = await downloadPublishedTarball(
    context,
    plan,
    npm,
    TARBALL_URL
  )

  expect(tarball.equals(Buffer.from('published-tarball'))).toBe(true)
  expect(fetchMock.mock.calls[0]).toEqual([
    TARBALL_URL,
    {
      headers: { authorization: 'Bearer mock-ambient-token' },
      signal: undefined,
    },
  ])
})

test('prefers ambient registry credentials over the NPM_TOKEN fallback', async () => {
  context.env = { NPM_TOKEN: 'mock-npm-token' }

  await writeFile(
    path.join(HOME_DIR, '.npmrc'),
    '//registry.npmjs.org/:_authToken=mock-ambient-token'
  )

  mockSuccessfulResponse('published-tarball')

  await downloadPublishedTarball(context, plan, npm, TARBALL_URL)

  expect(fetchMock.mock.calls[0]?.[1]).toEqual({
    headers: { authorization: 'Bearer mock-ambient-token' },
    signal: undefined,
  })
})

test('falls back to NPM_TOKEN bearer credentials without ambient credentials', async () => {
  context.env = { NPM_TOKEN: 'mock-npm-token' }

  mockSuccessfulResponse('published-tarball')

  await downloadPublishedTarball(context, plan, npm, TARBALL_URL)

  expect(fetchMock.mock.calls[0]?.[1]).toEqual({
    headers: { authorization: 'Bearer mock-npm-token' },
    signal: undefined,
  })
})

test('downloads without credentials when only OIDC tokens exist', async () => {
  context.env = { NPM_ID_TOKEN: 'mock-id-token' }

  mockSuccessfulResponse('published-tarball')

  await downloadPublishedTarball(context, plan, npm, TARBALL_URL)

  expect(fetchMock.mock.calls[0]).toEqual([
    TARBALL_URL,
    { headers: {}, signal: undefined },
  ])
})

test('uses Yarn Berry registry credentials for the download', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd

    await writeFile(
      path.join(cwd, '.yarnrc.yml'),
      'npmAuthToken: mock-berry-token\n'
    )

    mockSuccessfulResponse('published-tarball')

    await downloadPublishedTarball(
      context,
      plan,
      yarnBerry,
      'https://registry.yarnpkg.com/a/-/a-1.2.3.tgz'
    )

    expect(fetchMock.mock.calls[0]?.[1]).toEqual({
      headers: { authorization: 'Bearer mock-berry-token' },
      signal: undefined,
    })
  })
})

test('throws when the registry responds with a non-OK status', async () => {
  fetchMock.mockResolvedValueOnce({ ok: false, status: 404 })

  await expect(
    downloadPublishedTarball(context, plan, npm, TARBALL_URL)
  ).rejects.toThrow(
    `Published tarball at "${TARBALL_URL}" could not be downloaded: HTTP 404`
  )
})

test('sends legacy .npmrc basic-auth credentials as a Basic header', async () => {
  await writeFile(
    path.join(HOME_DIR, '.npmrc'),
    '//registry.npmjs.org/:_auth=bW9jazphdXRoLWNyZWRlbnRpYWxz'
  )

  mockSuccessfulResponse('published-tarball')

  await downloadPublishedTarball(context, plan, npm, TARBALL_URL)

  expect(fetchMock.mock.calls[0]?.[1]).toEqual({
    headers: { authorization: 'Basic bW9jazphdXRoLWNyZWRlbnRpYWxz' },
    signal: undefined,
  })
})

test('forwards the context abort signal to the tarball fetch', async () => {
  const controller = new AbortController()

  context.signal = controller.signal

  mockSuccessfulResponse('published-tarball')

  await downloadPublishedTarball(context, plan, npm, TARBALL_URL)

  expect(fetchMock.mock.calls[0]).toEqual([
    TARBALL_URL,
    { headers: {}, signal: controller.signal },
  ])
})

test('downloads without credentials when the tarball URL is unparseable', async () => {
  context.env = { NPM_TOKEN: 'mock-npm-token' }

  mockSuccessfulResponse('published-tarball')

  await downloadPublishedTarball(context, plan, npm, 'not-a-registry-url')

  expect(fetchMock.mock.calls[0]?.[1]).toEqual({
    headers: {},
    signal: undefined,
  })
})

test('falls back to NPM_TOKEN when the npm configuration cannot be loaded', async () => {
  context.env = { NPM_TOKEN: 'mock-npm-token' }

  loadConfig.mockRejectedValueOnce(new Error('mock config failure'))

  mockSuccessfulResponse('published-tarball')

  await downloadPublishedTarball(context, plan, npm, TARBALL_URL)

  expect(fetchMock.mock.calls[0]?.[1]).toEqual({
    headers: { authorization: 'Bearer mock-npm-token' },
    signal: undefined,
  })
})

test('withholds NPM_TOKEN when the tarball is served by another origin', async () => {
  context.env = { NPM_TOKEN: 'mock-npm-token' }

  mockSuccessfulResponse('published-tarball')

  await downloadPublishedTarball(
    context,
    plan,
    npm,
    'https://mirror.example.com/a/-/a-1.2.3.tgz'
  )

  expect(fetchMock.mock.calls[0]?.[1]).toEqual({
    headers: {},
    signal: undefined,
  })
})

test('sends NPM_TOKEN when the publish registry matches the tarball origin', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_TOKEN: 'mock-npm-token' }

    await writeFile(
      path.join(cwd, 'package.json'),
      '{"publishConfig":{"registry":"https://mirror.example.com/"}}'
    )

    mockSuccessfulResponse('published-tarball')

    await downloadPublishedTarball(
      context,
      plan,
      npm,
      'https://mirror.example.com/a/-/a-1.2.3.tgz'
    )

    expect(fetchMock.mock.calls[0]?.[1]).toEqual({
      headers: { authorization: 'Bearer mock-npm-token' },
      signal: undefined,
    })
  })
})

test('uses Yarn Berry scope credentials for scoped packages', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd

    await writeFile(
      path.join(cwd, '.yarnrc.yml'),
      'npmScopes:\n  mock-scope:\n    npmAuthToken: mock-scope-token\n'
    )

    mockSuccessfulResponse('published-tarball')

    await downloadPublishedTarball(context, scopedPlan, yarnBerry, TARBALL_URL)

    expect(fetchMock.mock.calls[0]?.[1]).toEqual({
      headers: { authorization: 'Bearer mock-scope-token' },
      signal: undefined,
    })
  })
})

test('prefers Yarn Berry per-registry credentials from npmRegistries', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd

    await writeFile(
      path.join(cwd, '.yarnrc.yml'),
      'npmRegistries:\n  "https://registry.npmjs.org":\n    npmAuthToken: mock-registry-token\n'
    )

    mockSuccessfulResponse('published-tarball')

    await downloadPublishedTarball(context, plan, yarnBerry, TARBALL_URL)

    expect(fetchMock.mock.calls[0]?.[1]).toEqual({
      headers: { authorization: 'Bearer mock-registry-token' },
      signal: undefined,
    })
  })
})

test('sends Yarn Berry npmAuthIdent credentials as a Basic header', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd

    await writeFile(
      path.join(cwd, '.yarnrc.yml'),
      'npmAuthIdent: bW9jazppZGVudC1jcmVkZW50aWFscw==\n'
    )

    mockSuccessfulResponse('published-tarball')

    await downloadPublishedTarball(
      context,
      plan,
      yarnBerry,
      'https://registry.yarnpkg.com/a/-/a-1.2.3.tgz'
    )

    expect(fetchMock.mock.calls[0]?.[1]).toEqual({
      headers: {
        authorization: 'Basic bW9jazppZGVudC1jcmVkZW50aWFscw==',
      },
      signal: undefined,
    })
  })
})

test('falls back to NPM_TOKEN when the Yarn configuration cannot be loaded', async () => {
  context.env = { NPM_TOKEN: 'mock-npm-token' }

  loadYarnConfig.mockRejectedValueOnce(new Error('mock config failure'))

  mockSuccessfulResponse('published-tarball')

  await downloadPublishedTarball(
    context,
    plan,
    yarnBerry,
    'https://registry.yarnpkg.com/a/-/a-1.2.3.tgz'
  )

  expect(fetchMock.mock.calls[0]?.[1]).toEqual({
    headers: { authorization: 'Bearer mock-npm-token' },
    signal: undefined,
  })
})

test('downloads without credentials when the Yarn default registry differs from the tarball registry', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd

    await writeFile(
      path.join(cwd, '.yarnrc.yml'),
      'npmRegistryServer: https://registry.yarnpkg.com\nnpmAuthToken: mock-berry-token\n'
    )

    mockSuccessfulResponse('published-tarball')

    await downloadPublishedTarball(context, plan, yarnBerry, TARBALL_URL)

    expect(fetchMock.mock.calls[0]).toEqual([
      TARBALL_URL,
      { headers: {}, signal: undefined },
    ])
  })
})
