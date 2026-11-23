// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import '../../../test/mock/env'

import type { ReleasePlan } from '@reelout/core'
import type { PackageManagerInfo } from '@reelout/npm'
import { PLUGIN_NAME, verifyPublishAccess } from '@reelout/yarn'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { temporaryDirectoryTask } from 'tempy'
import { beforeEach, expect, test, vi } from 'vitest'
import { context, logger } from '../../../test/mock/context'

const execCommand = vi.hoisted(() => vi.fn())

vi.mock(import('@reelout/core/util/execCommand'), () => ({
  execCommand: (command, args, options) => execCommand(command, args, options),
}))

const NPMJS = 'https://registry.npmjs.org/'

const YARNPKG = 'https://registry.yarnpkg.com/'

const createPackageManager = (
  name: 'yarn',
  isYarnBerry = false
): PackageManagerInfo => ({
  name,
  isNpm: false,
  isPnpm: false,
  isYarn: true,
  isYarnClassic: !isYarnBerry,
  isYarnBerry,
})

interface PlanOptions {
  name?: string | undefined
  version?: string | undefined
  isPrivate?: boolean | undefined
  provider?: string | undefined
  hasRelease?: boolean | undefined
}

const createPlan = (options: PlanOptions = {}): ReleasePlan =>
  ({
    package: {
      provider: options.provider ?? PLUGIN_NAME,
      name: options.name,
      version: '1.2.2',
      private: options.isPrivate ?? false,
      root: false,
      entry: false,
      dependencies: [],
      location: '.',
    },
    history: [],
    release:
      options.hasRelease === false
        ? null
        : { type: 'patch', version: options.version ?? '1.2.3' },
  }) as ReleasePlan

interface RegistryResponses {
  whoami?: string | Error | undefined
  packument?: string | Error | undefined
  collaborators?: string | Error | undefined
  team?: string | Error | undefined
  org?: string | Error | undefined
}

const mockRegistry = (responses: RegistryResponses): void => {
  execCommand.mockImplementation(
    async (command: string, args: readonly string[]) => {
      const respond = (response: string | Error | undefined): string => {
        if (response === undefined) {
          throw new Error(`Unexpected command: ${command} ${args.join(' ')}`)
        }

        if (response instanceof Error) {
          throw response
        }

        return response
      }

      if (args.includes('whoami')) {
        return respond(responses.whoami)
      }

      if (args.includes('view') || args.includes('info')) {
        return respond(responses.packument)
      }

      if (args.includes('ls-collaborators')) {
        return respond(responses.collaborators)
      }

      if (args.includes('team')) {
        return respond(responses.team)
      }

      if (args.includes('org')) {
        return respond(responses.org)
      }

      throw new Error(`Unexpected command: ${command} ${args.join(' ')}`)
    }
  )
}

const maintainedBy = (name: string): string =>
  JSON.stringify({ name: 'a', maintainers: [{ name }] })

const notFoundError = (name: string): Error =>
  new Error(
    `Command 'npm view ${name} --json --registry ${NPMJS}' failed (exit code 1)
npm error code E404
npm error 404 No match found for package ${name}`
  )

const yarnNotFoundError = (name: string): Error =>
  new Error(
    `Command 'yarn npm info ${name} --json' failed (exit code 1)
Response Code: 404`
  )

const unauthorizedError = (target: string): Error =>
  new Error(
    `Command 'npm ${target}' failed (exit code 1)
npm error code E401
npm error 401 Unauthorized`
  )

const writeYarnBerryAmbientCredentials = (cwd: string): Promise<void> =>
  writeFile(
    path.join(cwd, '.yarnrc.yml'),
    [
      'npmRegistries:',
      `  ${YARNPKG}:`,
      '    npmAuthToken: mock-yarn-token',
      '',
    ].join('\n')
  )

const warnCalls = (): string[] =>
  logger.mock.calls.flatMap(([message]) =>
    typeof message === 'string' ? [message] : []
  )

beforeEach(() => {
  vi.resetAllMocks()
})

test('probes with yarn npm info and resolves the identity with yarn npm whoami for Yarn Berry', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_TOKEN: 'mock-npm-token' }

    const plan = createPlan({ name: 'a' })

    mockRegistry({
      whoami: 'mock-user',
      packument: maintainedBy('mock-user'),
    })

    const verdicts = await verifyPublishAccess(
      context,
      [plan],
      createPackageManager('yarn', true)
    )

    expect(verdicts.get(plan)).toBe('allowed')

    expect(execCommand.mock.calls.map((call) => [call[0], call[1]])).toEqual([
      ['yarn', ['npm', 'info', 'a', '--json']],
      ['yarn', ['npm', 'whoami']],
    ])
  })
})

test('probes with npm view and resolves the identity with npm whoami for Yarn Classic', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_TOKEN: 'mock-npm-token' }

    const plan = createPlan({ name: 'a' })

    mockRegistry({
      whoami: 'mock-user',
      packument: maintainedBy('mock-user'),
    })

    const verdicts = await verifyPublishAccess(
      context,
      [plan],
      createPackageManager('yarn')
    )

    expect(verdicts.get(plan)).toBe('allowed')

    expect(execCommand.mock.calls.map((call) => [call[0], call[1]])).toEqual([
      ['npm', ['view', 'a', '--json', '--registry', NPMJS]],
      ['npm', ['whoami', '--registry', NPMJS]],
    ])
  })
})

test('allows a new unscoped package when Yarn Berry reports it as missing', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_TOKEN: 'mock-npm-token' }

    const plan = createPlan({ name: 'a' })

    mockRegistry({
      packument: yarnNotFoundError('a'),
    })

    const verdicts = await verifyPublishAccess(
      context,
      [plan],
      createPackageManager('yarn', true)
    )

    expect(verdicts.get(plan)).toBe('allowed')
    expect(execCommand).toHaveBeenCalledTimes(1)
  })
})

test('allows a new unscoped package when Yarn Classic reports it as missing', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_TOKEN: 'mock-npm-token' }

    const plan = createPlan({ name: 'a' })

    mockRegistry({
      packument: notFoundError('a'),
    })

    const verdicts = await verifyPublishAccess(
      context,
      [plan],
      createPackageManager('yarn')
    )

    expect(verdicts.get(plan)).toBe('allowed')
    expect(execCommand).toHaveBeenCalledTimes(1)
  })
})

test('denies publishing an unscoped package the identity does not maintain', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_TOKEN: 'mock-npm-token' }

    const plan = createPlan({ name: 'a' })

    mockRegistry({
      whoami: 'mock-user',
      packument: maintainedBy('other-user'),
    })

    const error: unknown = await verifyPublishAccess(
      context,
      [plan],
      createPackageManager('yarn', true)
    ).catch((err: unknown) => err)

    expect(error).toMatchInlineSnapshot(
      `[Error: Missing publish permission for "a@1.2.3" (https://registry.yarnpkg.com/).]`
    )
  })
})

test('warns when the registry metadata omits maintainers', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_TOKEN: 'mock-npm-token' }

    const plan = createPlan({ name: 'a' })

    mockRegistry({
      whoami: 'mock-user',
      packument: JSON.stringify({ name: 'a' }),
    })

    const verdicts = await verifyPublishAccess(
      context,
      [plan],
      createPackageManager('yarn', true)
    )

    expect(verdicts.get(plan)).toBe('unknown')

    expect(
      warnCalls().filter((message) =>
        message.includes(
          'Could not verify publish permission for "a@1.2.3": the registry will reject the publish if access is missing.'
        )
      )
    ).toHaveLength(1)
  })
})

test('allows publishing a new scoped package under the identity personal scope', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_TOKEN: 'mock-npm-token' }

    const plan = createPlan({ name: '@scope/new' })

    mockRegistry({
      whoami: 'scope',
      packument: yarnNotFoundError('@scope/new'),
    })

    const verdicts = await verifyPublishAccess(
      context,
      [plan],
      createPackageManager('yarn', true)
    )

    expect(verdicts.get(plan)).toBe('allowed')
  })
})

test('allows publishing a new scoped package when the organization roster lists the identity', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_TOKEN: 'mock-npm-token' }

    const plan = createPlan({ name: '@scope/new' })

    mockRegistry({
      whoami: 'mock-user',
      packument: yarnNotFoundError('@scope/new'),
      org: JSON.stringify({ 'mock-user': 'developer' }),
    })

    const verdicts = await verifyPublishAccess(
      context,
      [plan],
      createPackageManager('yarn', true)
    )

    expect(verdicts.get(plan)).toBe('allowed')
  })
})

test('allows publishing a scoped package when the collaborator list grants write access', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_TOKEN: 'mock-npm-token' }

    const plan = createPlan({ name: '@scope/pkg' })

    mockRegistry({
      whoami: 'mock-user',
      packument: maintainedBy('other-user'),
      collaborators: JSON.stringify({ 'mock-user': 'write' }),
    })

    const verdicts = await verifyPublishAccess(
      context,
      [plan],
      createPackageManager('yarn', true)
    )

    expect(verdicts.get(plan)).toBe('allowed')
  })
})

test('allows publishing a scoped package when a write team lists the identity as a member', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_TOKEN: 'mock-npm-token' }

    const plan = createPlan({ name: '@scope/pkg' })

    mockRegistry({
      whoami: 'mock-user',
      packument: maintainedBy('other-user'),
      collaborators: JSON.stringify({ '@scope:team': 'write' }),
      team: JSON.stringify(['mock-user']),
    })

    const verdicts = await verifyPublishAccess(
      context,
      [plan],
      createPackageManager('yarn', true)
    )

    expect(verdicts.get(plan)).toBe('allowed')
  })
})

test('skips private, unnamed, unversioned, and foreign-provider plans', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_TOKEN: 'mock-npm-token' }

    const plans = [
      createPlan({ name: 'a', isPrivate: true }),
      createPlan({ name: undefined }),
      createPlan({ name: 'a', hasRelease: false }),
      createPlan({ name: 'a', provider: '@reelout/npm' }),
    ]

    const verdicts = await verifyPublishAccess(
      context,
      plans,
      createPackageManager('yarn', true)
    )

    expect(verdicts.size).toBe(0)
    expect(execCommand).not.toHaveBeenCalled()
  })
})

test('warns when Yarn Berry ambient credentials cannot authenticate the collaborator lookup', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = {}

    await writeYarnBerryAmbientCredentials(cwd)

    const plan = createPlan({ name: '@scope/pkg' })

    mockRegistry({
      whoami: 'mock-user',
      packument: maintainedBy('other-user'),
      collaborators: unauthorizedError('ls-collaborators @scope/pkg'),
    })

    const verdicts = await verifyPublishAccess(
      context,
      [plan],
      createPackageManager('yarn', true)
    )

    expect(verdicts.get(plan)).toBe('unknown')

    expect(
      warnCalls().filter((message) =>
        message.includes(
          'Could not verify publish permission for "@scope/pkg@1.2.3": the registry will reject the publish if access is missing.'
        )
      )
    ).toHaveLength(1)

    expect(execCommand.mock.calls.map((call) => [call[0], call[1]])).toEqual([
      ['yarn', ['npm', 'info', '@scope/pkg', '--json']],
      ['yarn', ['npm', 'whoami']],
      [
        'npm',
        [
          'access',
          'ls-collaborators',
          '@scope/pkg',
          '--json',
          '--registry',
          YARNPKG,
        ],
      ],
    ])
  })
})

test('warns when Yarn Berry ambient credentials cannot authenticate the organization roster lookup', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = {}

    await writeYarnBerryAmbientCredentials(cwd)

    const plan = createPlan({ name: '@scope/new' })

    mockRegistry({
      whoami: 'mock-user',
      packument: yarnNotFoundError('@scope/new'),
      org: unauthorizedError('org ls scope'),
    })

    const verdicts = await verifyPublishAccess(
      context,
      [plan],
      createPackageManager('yarn', true)
    )

    expect(verdicts.get(plan)).toBe('unknown')

    expect(
      warnCalls().filter((message) =>
        message.includes(
          'Could not verify publish permission for "@scope/new@1.2.3": the registry will reject the publish if access is missing.'
        )
      )
    ).toHaveLength(1)
  })
})

test('rejects when Yarn Berry injected credentials cannot authenticate the collaborator lookup', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_TOKEN: 'mock-npm-token' }

    const plan = createPlan({ name: '@scope/pkg' })

    mockRegistry({
      whoami: 'mock-user',
      packument: maintainedBy('other-user'),
      collaborators: unauthorizedError('ls-collaborators @scope/pkg'),
    })

    const error: unknown = await verifyPublishAccess(
      context,
      [plan],
      createPackageManager('yarn', true)
    ).catch((err: unknown) => err)

    expect(error).toMatchInlineSnapshot(
      `[Error: NPM_TOKEN or ambient registry credentials are invalid or expired.]`
    )
  })
})

test('warns when Yarn Berry ambient credentials take precedence over an injected token in the collaborator lookup', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_TOKEN: 'mock-npm-token' }

    await writeYarnBerryAmbientCredentials(cwd)

    const plan = createPlan({ name: '@scope/pkg' })

    mockRegistry({
      whoami: 'mock-user',
      packument: maintainedBy('other-user'),
      collaborators: unauthorizedError('ls-collaborators @scope/pkg'),
    })

    const verdicts = await verifyPublishAccess(
      context,
      [plan],
      createPackageManager('yarn', true)
    )

    expect(verdicts.get(plan)).toBe('unknown')

    expect(
      warnCalls().filter((message) =>
        message.includes(
          'Could not verify publish permission for "@scope/pkg@1.2.3": the registry will reject the publish if access is missing.'
        )
      )
    ).toHaveLength(1)
  })
})

test('rejects when the identity lookup reports invalid credentials', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_TOKEN: 'mock-npm-token' }

    const plan = createPlan({ name: 'a' })

    mockRegistry({
      whoami: unauthorizedError(
        'whoami --registry https://registry.yarnpkg.com/'
      ),
      packument: maintainedBy('other-user'),
    })

    const error: unknown = await verifyPublishAccess(
      context,
      [plan],
      createPackageManager('yarn', true)
    ).catch((err: unknown) => err)

    expect(error).toMatchInlineSnapshot(
      `[Error: NPM_TOKEN or ambient registry credentials are invalid or expired.]`
    )
  })
})
