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

const pkg = { location: '.' } as Package

const plan = { package: pkg, history: [], release: null } as ReleasePlan

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
