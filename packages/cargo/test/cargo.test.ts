// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import '../../../test/mock/fs'

import { executeReleaseWorkflow, type ReleasePlan } from '@reelout/core'
import plugin, { PLUGIN_NAME } from '@reelout/cargo'
import { vol } from 'memfs'
import { readFile } from 'node:fs/promises'
import { beforeEach, expect, test, vi } from 'vitest'
import {
  context,
  createMockRepository,
  logger,
} from '../../../test/mock/context'

const execCommand = vi.hoisted(() => vi.fn())

const loadCargoPackages = vi.hoisted(() => vi.fn())

const resolveCargoToken = vi.hoisted(() => vi.fn())

const verifyRegistryToken = vi.hoisted(() => vi.fn())

const hasTrustedPublishingAuth = vi.hoisted(() => vi.fn())

const verifyTrustedPublishing = vi.hoisted(() => vi.fn())

const refreshCargoLock = vi.hoisted(() => vi.fn())

const verifyPublishAccess = vi.hoisted(() => vi.fn())

const probeCrateReleasePlan = vi.hoisted(() => vi.fn())

const probePublishedCrate = vi.hoisted(() => vi.fn())

const isIdentical = vi.hoisted(() => vi.fn())

const publishCrate = vi.hoisted(() => vi.fn())

vi.mock(import('@reelout/core/util/execCommand'), () => ({
  execCommand: (command, args, options) => execCommand(command, args, options),
}))

vi.mock(import('@reelout/cargo/loadCargoPackages'), () => ({
  loadCargoPackages,
}))

vi.mock(import('@reelout/cargo/refreshCargoLock'), () => ({
  refreshCargoLock,
}))

vi.mock(import('@reelout/cargo/verifyPublishAccess'), () => ({
  verifyPublishAccess,
}))

vi.mock(import('@reelout/cargo/proveSameCratePublication'), () => ({
  proveSameCratePublication: isIdentical,
}))

vi.mock(import('@reelout/cargo/probeCrateReleasePlan'), () => ({
  probeCrateReleasePlan,
}))

vi.mock(import('@reelout/cargo/probePublishedCrate'), () => ({
  probePublishedCrate,
}))

vi.mock(import('@reelout/cargo/publishCrate'), () => ({
  publishCrate,
}))

vi.mock(import('@reelout/cargo/resolveCargoToken'), () => ({
  resolveCargoToken,
}))

vi.mock(import('@reelout/cargo/verifyRegistryToken'), () => ({
  verifyRegistryToken,
}))

vi.mock(import('@reelout/cargo/verifyTrustedPublishing'), () => ({
  hasTrustedPublishingAuth,
  verifyTrustedPublishing,
}))

interface CreatePlanOptions {
  name?: string | undefined
  location: string
  releaseVersion?: string | null | undefined
  private?: boolean | undefined
  provider?: string | undefined
}

function createPlan(options: CreatePlanOptions): ReleasePlan {
  return {
    package: {
      provider: options.provider ?? PLUGIN_NAME,
      name: options.name,
      version: '1.2.2',
      private: options.private ?? false,
      root: options.location === '.',
      entry: options.location === '.',
      dependencies: [],
      location: options.location,
    },
    history: [],
    release:
      options.releaseVersion == null
        ? null
        : { type: 'patch', version: options.releaseVersion },
  }
}

function createCompletePlan(
  options: Partial<CreatePlanOptions> = {}
): ReleasePlan {
  return createPlan({
    name: 'a',
    location: '.',
    releaseVersion: '1.2.3',
    ...options,
  })
}

const mountManifest = (): void => {
  vol.fromJSON({
    '/repo/Cargo.toml': '[package]\nname = "a"\nversion = "1.2.2"\n',
  })
}

const publishOverError = () =>
  new Error('crate version `1.2.3` is already uploaded')

const warnCalls = (): string[] =>
  logger.mock.calls.flatMap(([message]) =>
    typeof message === 'string' ? [message] : []
  )

beforeEach(() => {
  vi.resetAllMocks()
  execCommand.mockResolvedValue('')
  loadCargoPackages.mockResolvedValue([])
  resolveCargoToken.mockResolvedValue('mock-registry-token')
  verifyRegistryToken.mockResolvedValue('mock-login')
  hasTrustedPublishingAuth.mockReturnValue(false)
  verifyTrustedPublishing.mockResolvedValue('mock-publish-token')
  probePublishedCrate.mockResolvedValue({ status: 'absent' })
  isIdentical.mockResolvedValue(true)
})

test('stays inactive without a Cargo manifest', async () => {
  await executeReleaseWorkflow(context, [plugin()])

  expect(context.repository).toBe(null)
  expect(loadCargoPackages).not.toHaveBeenCalled()
  expect(resolveCargoToken).not.toHaveBeenCalled()
  expect(publishCrate).not.toHaveBeenCalled()
  expect(context.outcome?.status).toBe('success')
})

test('resolves the repository from the root manifest', async () => {
  vol.fromJSON({
    '/repo/Cargo.toml':
      '[package]\nname = "a"\nversion = "1.2.3"\nrepository = "https://github.com/user/repo"\n',
  })

  await executeReleaseWorkflow(context, [plugin()])

  expect(context.repository).toEqual({
    host: 'github',
    owner: 'user',
    repo: 'repo',
    url: 'https://github.com/user/repo',
  })
})

test('keeps the existing repository when the manifest defines none', async () => {
  vol.fromJSON({
    '/repo/Cargo.toml': '[package]\nname = "a"\nversion = "1.2.3"\n',
  })

  const existing = createMockRepository('gitlab')

  context.repository = existing

  await executeReleaseWorkflow(context, [plugin()])

  expect(context.repository).toBe(existing)
})

test('discovers cargo packages and warns about load failures', async () => {
  vol.fromJSON({
    '/repo/Cargo.toml': '[package]\nname = "a"\nversion = "1.2.3"\n',
  })

  loadCargoPackages.mockResolvedValue([
    {
      status: 'fulfilled',
      value: {
        name: 'root-crate',
        version: '0.2.0',
        private: false,
        root: true,
        entry: true,
        dependencies: ['child'],
        location: '.',
        files: '**/*',
      },
    },
    { status: 'rejected', reason: new Error('mock load failure') },
    {
      status: 'fulfilled',
      value: {
        name: 'child',
        version: '0.2.0',
        private: false,
        root: false,
        entry: false,
        dependencies: [],
        location: 'crates/child',
        files: ['crates/child/**/*'],
      },
    },
  ])

  await executeReleaseWorkflow(context, [plugin()])

  expect(context.packages.map((pkg) => [pkg.name, pkg.provider])).toEqual([
    ['child', PLUGIN_NAME],
    ['root-crate', PLUGIN_NAME],
  ])

  expect(
    warnCalls().some((message) =>
      message.includes('Package could not be loaded: mock load failure')
    )
  ).toBe(true)
})

test('filters discovered packages against the context filter patterns', async () => {
  vol.fromJSON({
    '/repo/Cargo.toml': '[package]\nname = "a"\nversion = "1.2.3"\n',
  })

  loadCargoPackages.mockResolvedValue([
    {
      status: 'fulfilled',
      value: {
        name: 'root-crate',
        version: '0.2.0',
        private: false,
        root: true,
        entry: true,
        dependencies: [],
        location: '.',
        files: '**/*',
      },
    },
    {
      status: 'fulfilled',
      value: {
        name: 'child',
        version: '0.2.0',
        private: false,
        root: false,
        entry: false,
        dependencies: [],
        location: 'crates/child',
        files: ['crates/child/**/*'],
      },
    },
  ])

  context.filter = ['child']

  await executeReleaseWorkflow(context, [plugin()])

  expect(context.packages.map((pkg) => pkg.name)).toEqual(['child'])
})

test('warns and skips publishing when the registry token is missing', async () => {
  mountManifest()

  resolveCargoToken.mockResolvedValue(undefined)

  context.plans = [createCompletePlan()]

  await executeReleaseWorkflow(context, [plugin()])

  expect(
    warnCalls().some((message) =>
      message.includes(
        'Crates will not be published: a crates.io registry token is required.'
      )
    )
  ).toBe(true)
  expect(verifyPublishAccess).not.toHaveBeenCalled()
  expect(publishCrate).not.toHaveBeenCalled()
  expect(context.outcome?.status).toBe('success')
})

test('rejects in strict mode when the registry token is missing', async () => {
  mountManifest()

  resolveCargoToken.mockResolvedValue(undefined)

  context.strict = true

  await expect(executeReleaseWorkflow(context, [plugin()])).rejects.toThrow(
    'The CARGO_REGISTRY_TOKEN environment variable is required in strict mode.'
  )
})

test('publishes through trusted publishing when no registry token exists', async () => {
  mountManifest()

  resolveCargoToken.mockResolvedValue(undefined)

  hasTrustedPublishingAuth.mockReturnValue(true)

  const plan = createCompletePlan()

  context.plans = [plan]

  await executeReleaseWorkflow(context, [plugin()])

  expect(
    warnCalls().some((message) =>
      message.includes(
        'Crates will not be published: a crates.io registry token is required.'
      )
    )
  ).toBe(false)

  expect(verifyRegistryToken).not.toHaveBeenCalled()
  expect(verifyPublishAccess).not.toHaveBeenCalled()
  expect(verifyTrustedPublishing).toHaveBeenCalledTimes(1)
  expect(verifyTrustedPublishing.mock.calls[0]).toEqual([context])
  expect(publishCrate).toHaveBeenCalledTimes(1)
  expect(publishCrate.mock.calls[0]).toEqual([
    context,
    plan,
    {
      dryRun: false,
      allowDirty: undefined,
      noVerify: undefined,
      registryToken: 'mock-publish-token',
    },
  ])
  expect(context.outcome?.status).toBe('success')
})

test('prefers the registry token over trusted publishing', async () => {
  mountManifest()

  hasTrustedPublishingAuth.mockReturnValue(true)

  context.plans = [createCompletePlan()]

  await executeReleaseWorkflow(context, [plugin()])

  expect(verifyRegistryToken).toHaveBeenCalledTimes(1)
  expect(verifyTrustedPublishing).not.toHaveBeenCalled()
  expect(publishCrate.mock.calls[0]?.[2]).toMatchObject({
    registryToken: undefined,
  })
})

test('fails the release when the trusted-publishing exchange is rejected', async () => {
  mountManifest()

  resolveCargoToken.mockResolvedValue(undefined)

  hasTrustedPublishingAuth.mockReturnValue(true)

  verifyTrustedPublishing.mockRejectedValueOnce(
    new Error('Trusted publishing could not be verified: HTTP 404.')
  )

  context.plans = [createCompletePlan()]

  await expect(executeReleaseWorkflow(context, [plugin()])).rejects.toThrow(
    'Trusted publishing could not be verified: HTTP 404.'
  )

  expect(probeCrateReleasePlan).not.toHaveBeenCalled()
  expect(publishCrate).not.toHaveBeenCalled()
})

test('skips the trusted-publishing exchange when no plan is publishable', async () => {
  mountManifest()

  resolveCargoToken.mockResolvedValue(undefined)

  hasTrustedPublishingAuth.mockReturnValue(true)

  context.plans = [createCompletePlan({ private: true })]

  await executeReleaseWorkflow(context, [plugin()])

  expect(verifyTrustedPublishing).not.toHaveBeenCalled()
  expect(verifyPublishAccess).not.toHaveBeenCalled()
  expect(context.outcome?.status).toBe('success')
})

test('warns and skips publishing when the cargo command is not available', async () => {
  mountManifest()

  execCommand.mockRejectedValue(new Error('spawn cargo ENOENT'))

  context.plans = [createCompletePlan()]

  await executeReleaseWorkflow(context, [plugin()])

  expect(
    warnCalls().some((message) =>
      message.includes(
        'Crates will not be published: the cargo command is not available.'
      )
    )
  ).toBe(true)
  expect(publishCrate).not.toHaveBeenCalled()
  expect(context.outcome?.status).toBe('success')
})

test('rejects in strict mode when the cargo command is not available', async () => {
  mountManifest()

  execCommand.mockRejectedValue(new Error('spawn cargo ENOENT'))

  context.strict = true

  await expect(executeReleaseWorkflow(context, [plugin()])).rejects.toThrow(
    'The cargo command is required for Cargo releases in strict mode.'
  )
})

test('rejects when the registry token cannot be verified', async () => {
  mountManifest()

  verifyRegistryToken.mockRejectedValue(new Error('mock verify failure'))

  await expect(executeReleaseWorkflow(context, [plugin()])).rejects.toThrow(
    'mock verify failure'
  )
})

test('skips manifest updates in dry runs', async () => {
  const manifest = '[package]\nname = "a"\nversion = "1.2.2"\n'

  vol.fromJSON({ '/repo/Cargo.toml': manifest })

  context.dryRun = true

  context.plans = [createCompletePlan()]

  await executeReleaseWorkflow(context, [plugin()])

  expect(await readFile('/repo/Cargo.toml', 'utf-8')).toBe(manifest)
  expect(refreshCargoLock).not.toHaveBeenCalled()
})

test('bumps crate manifests and refreshes the lockfile', async () => {
  vol.fromJSON({
    '/repo/Cargo.toml':
      '[package]\nname = "a"\nversion = "1.2.2"\n\n[dependencies]\nb = "^1.2.2"\n',
    '/repo/crates/b/Cargo.toml': '[package]\nname = "b"\nversion = "1.2.2"\n',
  })

  context.plans = [
    createPlan({ name: 'a', location: '.', releaseVersion: '1.2.3' }),
    createPlan({
      name: 'b',
      location: 'crates/b',
      releaseVersion: '1.2.3',
    }),
  ]

  await executeReleaseWorkflow(context, [plugin()])

  expect(await readFile('/repo/Cargo.toml', 'utf-8')).toBe(
    '[package]\nname = "a"\nversion = "1.2.3"\n\n[dependencies]\nb = "^1.2.3"\n'
  )
  expect(await readFile('/repo/crates/b/Cargo.toml', 'utf-8')).toBe(
    '[package]\nname = "b"\nversion = "1.2.3"\n'
  )
  expect(refreshCargoLock).toHaveBeenCalledWith(context)
})

test('skips the lockfile refresh when no manifest changed', async () => {
  vol.fromJSON({
    '/repo/Cargo.toml': '[package]\nname = "a"\nversion = "1.2.3"\n',
  })

  context.plans = [createCompletePlan()]

  await executeReleaseWorkflow(context, [plugin()])

  expect(refreshCargoLock).not.toHaveBeenCalled()
})

test('skips the lockfile refresh for plans without a release', async () => {
  const manifest = '[package]\nname = "a"\nversion = "1.2.2"\n'

  vol.fromJSON({ '/repo/Cargo.toml': manifest })

  context.plans = [
    createPlan({ name: 'a', location: '.', releaseVersion: null }),
  ]

  await executeReleaseWorkflow(context, [plugin()])

  expect(refreshCargoLock).not.toHaveBeenCalled()
  expect(await readFile('/repo/Cargo.toml', 'utf-8')).toBe(manifest)
})

test('does not modify crate manifests when owned by another provider', async () => {
  const manifest = '[package]\nname = "x"\nversion = "9.9.9"\n'

  vol.fromJSON({
    '/repo/Cargo.toml': '[package]\nname = "a"\nversion = "1.2.3"\n',
    '/repo/other/Cargo.toml': manifest,
  })

  context.plans = [
    createPlan({
      name: 'x',
      location: 'other',
      releaseVersion: '9.9.10',
      provider: '@reelout/npm',
    }),
  ]

  await executeReleaseWorkflow(context, [plugin()])

  expect(await readFile('/repo/other/Cargo.toml', 'utf-8')).toBe(manifest)
})

test('verifies access, probes, and publishes each plan', async () => {
  mountManifest()

  const plan = createCompletePlan()

  context.plans = [plan]

  await executeReleaseWorkflow(context, [plugin()])

  expect(verifyPublishAccess).toHaveBeenCalledTimes(1)
  expect(verifyPublishAccess.mock.calls[0]?.[0]).toBe(context)
  expect(verifyPublishAccess.mock.calls[0]?.[1]).toEqual([plan])
  expect(verifyPublishAccess.mock.calls[0]?.[2]).toMatchObject({
    token: 'mock-registry-token',
    login: 'mock-login',
  })

  expect(probeCrateReleasePlan).toHaveBeenCalledTimes(1)
  expect(probeCrateReleasePlan.mock.calls[0]?.[0]).toBe(context)
  expect(probeCrateReleasePlan.mock.calls[0]?.[1]).toBe(plan)

  expect(publishCrate).toHaveBeenCalledTimes(1)
  expect(publishCrate.mock.calls[0]).toEqual([
    context,
    plan,
    {
      dryRun: false,
      allowDirty: undefined,
      noVerify: undefined,
      registryToken: undefined,
    },
  ])
})

test('forwards the allow-dirty and no-verify options to the publish', async () => {
  mountManifest()

  context.plans = [createCompletePlan()]

  await executeReleaseWorkflow(context, [
    plugin({ allowDirty: true, noVerify: true }),
  ])

  expect(publishCrate.mock.calls[0]?.[2]).toEqual({
    dryRun: false,
    allowDirty: true,
    noVerify: true,
    registryToken: undefined,
  })
})

test('forwards the dry-run status to the publish', async () => {
  mountManifest()

  context.dryRun = true

  context.plans = [createCompletePlan()]

  await executeReleaseWorkflow(context, [plugin()])

  expect(publishCrate.mock.calls[0]?.[2]).toMatchObject({ dryRun: true })
})

test('skips the publish when the probe marks the plan as already published', async () => {
  mountManifest()

  context.plans = [createCompletePlan()]

  probeCrateReleasePlan.mockImplementation(
    async (
      _context: unknown,
      plan: ReleasePlan,
      _index: unknown,
      skipped: Set<ReleasePlan>
    ) => {
      skipped.add(plan)
    }
  )

  await executeReleaseWorkflow(context, [plugin()])

  expect(publishCrate).not.toHaveBeenCalled()
  expect(context.outcome?.status).toBe('success')
})

test('rejects when the registry already holds a different version', async () => {
  mountManifest()

  context.plans = [createCompletePlan()]

  probeCrateReleasePlan.mockRejectedValueOnce(
    new Error(
      'Version "a@1.2.3" was not published: the registry already has this version and its content could not be verified as identical.'
    )
  )

  await expect(executeReleaseWorkflow(context, [plugin()])).rejects.toThrow(
    'Version "a@1.2.3" was not published: the registry already has this version and its content could not be verified as identical.'
  )

  expect(publishCrate).not.toHaveBeenCalled()
})

test('rejects when publish access is denied', async () => {
  mountManifest()

  context.plans = [createCompletePlan()]

  verifyPublishAccess.mockRejectedValueOnce(
    new Error(
      'Crates will not be published: the authenticated registry user is not an owner of "a@1.2.3".'
    )
  )

  await expect(executeReleaseWorkflow(context, [plugin()])).rejects.toThrow(
    'Crates will not be published: the authenticated registry user is not an owner of "a@1.2.3".'
  )

  expect(probeCrateReleasePlan).not.toHaveBeenCalled()
  expect(publishCrate).not.toHaveBeenCalled()
})

test('recovers when an identical version was published concurrently', async () => {
  mountManifest()

  context.plans = [createCompletePlan()]

  publishCrate.mockRejectedValueOnce(publishOverError())

  probePublishedCrate.mockResolvedValue({
    status: 'published',
    cksum: 'checksum-published',
  })

  await executeReleaseWorkflow(context, [plugin()])

  expect(probePublishedCrate.mock.calls[0]).toEqual([
    'a',
    '1.2.3',
    { index: expect.anything(), fresh: true },
  ])
  expect(
    warnCalls().some((message) =>
      message.includes(
        'Treating publish of "a@1.2.3" as complete: an identical version was published concurrently.'
      )
    )
  ).toBe(true)
  expect(context.outcome?.status).toBe('success')
})

test('rethrows the original publish error when the concurrently published version differs', async () => {
  mountManifest()

  context.plans = [createCompletePlan()]

  probePublishedCrate.mockResolvedValue({
    status: 'published',
    cksum: 'checksum-published',
  })

  isIdentical.mockResolvedValue(false)

  const failure = publishOverError()

  publishCrate.mockRejectedValueOnce(failure)

  await expect(executeReleaseWorkflow(context, [plugin()])).rejects.toBe(
    failure
  )
})

test('rejects publish failures that are not publish-over conflicts', async () => {
  mountManifest()

  context.plans = [createCompletePlan()]

  const failure = new Error('network unreachable')

  publishCrate.mockRejectedValueOnce(failure)

  await expect(executeReleaseWorkflow(context, [plugin()])).rejects.toBe(
    failure
  )

  expect(probePublishedCrate).not.toHaveBeenCalled()
})

test('publishes private crates without registry checks', async () => {
  mountManifest()

  context.plans = [createCompletePlan({ private: true })]

  await executeReleaseWorkflow(context, [plugin()])

  expect(verifyPublishAccess).not.toHaveBeenCalled()
  expect(probeCrateReleasePlan).not.toHaveBeenCalled()
  expect(publishCrate).toHaveBeenCalledTimes(1)
})

test('does not publish crates when owned by another provider', async () => {
  mountManifest()

  context.plans = [createCompletePlan({ provider: '@reelout/npm' })]

  await executeReleaseWorkflow(context, [plugin()])

  expect(verifyPublishAccess).not.toHaveBeenCalled()
  expect(publishCrate).not.toHaveBeenCalled()
})
