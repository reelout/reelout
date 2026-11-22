// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import '../mock/env'
import '../mock/git'
import '../mock/util'

import { beforeAll, beforeEach, vi } from 'vitest'

vi.mock(import('@reelout/npm/publishPackage'), async () => ({
  publishPackage: vi.fn(),
}))

// The integration environment is assumed fully provisioned, so every plan
// passes the publish permission pre-flight.
vi.mock(import('@reelout/npm/verifyPublishAccess'), () => ({
  verifyPublishAccess: vi.fn(async () => new Map()),
}))

// The integration environment is assumed fully provisioned, so trusted
// publishing is verified without the registry's token exchange.
vi.mock(import('@reelout/npm/verifyTrustedPublishing'), () => ({
  verifyTrustedPublishing: vi.fn(async () => {}),
}))

vi.mock(import('@reelout/github/createRelease'), async () => ({
  createRelease: vi.fn(async () => async () => {}),
}))

vi.mock(import('@reelout/github/verifyToken'), async () => ({
  verifyToken: vi.fn(async () => {}),
}))

vi.mock(import('@reelout/github/isRepositoryPublic'), async () => ({
  isRepositoryPublic: vi.fn(async () => true),
}))

beforeAll(() => {
  vi.useFakeTimers({ now: new Date('2026-01-01T00:00:00Z') })
})

beforeEach(() => {
  vi.resetAllMocks()
  vi.unstubAllEnvs()
  vi.stubEnv('GITHUB_ACTIONS', undefined)
  vi.stubEnv('GITHUB_STEP_SUMMARY', undefined)
  vi.stubEnv('GITHUB_TOKEN', 'mock-github-token')
  vi.stubEnv('NPM_ID_TOKEN', 'mock-id-token')
})
