// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import '../../../test/mock/env'

import type { ReleasePlan } from '@reelout/core'
import {
  PLUGIN_NAME,
  verifyPublishAccess,
  type PackageManagerInfo,
} from '@reelout/npm'
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

const createPackageManager = (
  name: 'npm' | 'pnpm' | 'yarn',
  isYarnBerry = false
): PackageManagerInfo => ({
  name,
  isNpm: name === 'npm',
  isPnpm: name === 'pnpm',
  isYarn: name === 'yarn',
  isYarnClassic: name === 'yarn' && !isYarnBerry,
  isYarnBerry: name === 'yarn' && isYarnBerry,
})

interface PlanOptions {
  name?: string | undefined
  version?: string | undefined
  isPrivate?: boolean | undefined
  provider?: string | undefined
  hasRelease?: boolean | undefined
  location?: string | undefined
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
      location: options.location ?? '.',
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

const unauthorizedError = (target: string): Error =>
  new Error(
    `Command 'npm ${target}' failed (exit code 1)
npm error code E401
npm error 401 Unauthorized`
  )

const YARNPKG = 'https://registry.yarnpkg.com/'

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

const permissionWarnings = (): string[] =>
  logger.mock.calls.flatMap(([message]) =>
    typeof message === 'string' &&
    message.includes('Could not verify publish permission for')
      ? [message]
      : []
  )

const warnCalls = (): string[] =>
  logger.mock.calls.flatMap(([message]) =>
    typeof message === 'string' ? [message] : []
  )

beforeEach(() => {
  vi.resetAllMocks()
})

test('allows publishing when the registry metadata lists the identity as a maintainer', async () => {
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
      createPackageManager('npm')
    )

    expect(verdicts.get(plan)).toBe('allowed')

    expect(execCommand.mock.calls).toEqual([
      [
        'npm',
        ['view', 'a', '--json', '--registry', NPMJS],
        {
          cwd,
          env: {
            NPM_TOKEN: 'mock-npm-token',
            'npm_config_//registry.npmjs.org/:_authToken': 'mock-npm-token',
          },
          signal: undefined,
        },
      ],
      [
        'npm',
        ['whoami', '--registry', NPMJS],
        {
          cwd,
          env: {
            NPM_TOKEN: 'mock-npm-token',
            'npm_config_//registry.npmjs.org/:_authToken': 'mock-npm-token',
          },
          signal: undefined,
        },
      ],
    ])
  })
})

test('matches maintainer names case-insensitively', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_TOKEN: 'mock-npm-token' }

    const plan = createPlan({ name: 'a' })

    mockRegistry({
      whoami: 'mock-user',
      packument: maintainedBy('Mock-User'),
    })

    const verdicts = await verifyPublishAccess(
      context,
      [plan],
      createPackageManager('npm')
    )

    expect(verdicts.get(plan)).toBe('allowed')
  })
})

test('allows publishing when the metadata reports maintainers as name-email strings', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_TOKEN: 'mock-npm-token' }

    const plan = createPlan({ name: 'a' })

    mockRegistry({
      whoami: 'mock-user',
      packument: JSON.stringify({
        name: 'a',
        maintainers: [
          'other-user <other@example.com>',
          'mock-user <mock@example.com>',
        ],
      }),
    })

    const verdicts = await verifyPublishAccess(
      context,
      [plan],
      createPackageManager('npm')
    )

    expect(verdicts.get(plan)).toBe('allowed')
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

    await expect(
      verifyPublishAccess(context, [plan], createPackageManager('npm'))
    ).rejects.toThrow(
      'Missing publish permission for "a@1.2.3" (https://registry.npmjs.org/).'
    )
  })
})

test('names every denied package in the aggregated rejection', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_TOKEN: 'mock-npm-token' }

    mockRegistry({
      whoami: 'mock-user',
      packument: maintainedBy('other-user'),
    })

    await expect(
      verifyPublishAccess(
        context,
        [
          createPlan({ name: 'a' }),
          createPlan({ name: 'b', version: '2.0.0' }),
        ],
        createPackageManager('npm')
      )
    ).rejects.toThrow(
      'Missing publish permission for "a@1.2.3" (https://registry.npmjs.org/), "b@2.0.0" (https://registry.npmjs.org/).'
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
      packument: JSON.stringify({ name: 'a', version: '1.2.3' }),
    })

    const verdicts = await verifyPublishAccess(
      context,
      [plan],
      createPackageManager('npm')
    )

    expect(verdicts.get(plan)).toBe('unknown')

    expect(
      permissionWarnings().filter((message) =>
        message.includes(
          'Could not verify publish permission for "a@1.2.3": the registry will reject the publish if access is missing.'
        )
      )
    ).toHaveLength(1)
  })
})

test('allows publishing a new unscoped package without querying the identity', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_TOKEN: 'mock-npm-token' }

    const plan = createPlan({ name: 'a' })

    mockRegistry({ packument: notFoundError('a') })

    const verdicts = await verifyPublishAccess(
      context,
      [plan],
      createPackageManager('npm')
    )

    expect(verdicts.get(plan)).toBe('allowed')
    expect(execCommand).toHaveBeenCalledTimes(1)
  })
})

test("allows publishing a new scoped package under the identity's personal scope", async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_TOKEN: 'mock-npm-token' }

    const plan = createPlan({ name: '@mock-user/new' })

    mockRegistry({
      whoami: 'mock-user',
      packument: notFoundError('@mock-user/new'),
    })

    const verdicts = await verifyPublishAccess(
      context,
      [plan],
      createPackageManager('npm')
    )

    expect(verdicts.get(plan)).toBe('allowed')

    expect(execCommand.mock.calls.map((call) => call[1])).toEqual([
      ['view', '@mock-user/new', '--json', '--registry', NPMJS],
      ['whoami', '--registry', NPMJS],
    ])
  })
})

test('warns when the identity cannot be resolved for a new scoped package', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_TOKEN: 'mock-npm-token' }

    const plan = createPlan({ name: '@scope/new' })

    mockRegistry({
      whoami: new Error('network unreachable'),
      packument: notFoundError('@scope/new'),
    })

    const verdicts = await verifyPublishAccess(
      context,
      [plan],
      createPackageManager('npm')
    )

    expect(verdicts.get(plan)).toBe('unknown')
    expect(permissionWarnings()).toHaveLength(1)
  })
})

test('allows publishing a new scoped package when the organization roster lists the identity', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_TOKEN: 'mock-npm-token' }

    const plan = createPlan({ name: '@scope/new' })

    mockRegistry({
      whoami: 'mock-user',
      packument: notFoundError('@scope/new'),
      org: JSON.stringify({ 'mock-user': 'developer' }),
    })

    const verdicts = await verifyPublishAccess(
      context,
      [plan],
      createPackageManager('npm')
    )

    expect(verdicts.get(plan)).toBe('allowed')

    expect(execCommand.mock.calls.map((call) => call[1])).toEqual([
      ['view', '@scope/new', '--json', '--registry', NPMJS],
      ['whoami', '--registry', NPMJS],
      ['org', 'ls', 'scope', '--json', '--registry', NPMJS],
    ])
  })
})

test('allows publishing a new scoped package when the organization roster is an array listing the identity', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_TOKEN: 'mock-npm-token' }

    const plan = createPlan({ name: '@scope/new' })

    mockRegistry({
      whoami: 'mock-user',
      packument: notFoundError('@scope/new'),
      org: JSON.stringify(['mock-user']),
    })

    const verdicts = await verifyPublishAccess(
      context,
      [plan],
      createPackageManager('npm')
    )

    expect(verdicts.get(plan)).toBe('allowed')
  })
})

test('allows publishing a new scoped package when a nested organization roster lists the identity', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_TOKEN: 'mock-npm-token' }

    const plan = createPlan({ name: '@scope/new' })

    mockRegistry({
      whoami: 'mock-user',
      packument: notFoundError('@scope/new'),
      org: JSON.stringify(['other-user', { 'mock-user': 'developer' }]),
    })

    const verdicts = await verifyPublishAccess(
      context,
      [plan],
      createPackageManager('npm')
    )

    expect(verdicts.get(plan)).toBe('allowed')
  })
})

test('denies publishing a new scoped package when the readable roster omits the identity', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_TOKEN: 'mock-npm-token' }

    const plan = createPlan({ name: '@scope/new' })

    mockRegistry({
      whoami: 'mock-user',
      packument: notFoundError('@scope/new'),
      org: JSON.stringify({ 'other-user': 'owner' }),
    })

    await expect(
      verifyPublishAccess(context, [plan], createPackageManager('npm'))
    ).rejects.toThrow(
      'Missing publish permission for "@scope/new@1.2.3" (https://registry.npmjs.org/).'
    )
  })
})

test('warns when the organization roster is valid JSON but neither an array nor an object', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_TOKEN: 'mock-npm-token' }

    const plan = createPlan({ name: '@scope/new' })

    mockRegistry({
      whoami: 'mock-user',
      packument: notFoundError('@scope/new'),
      org: 'null',
    })

    const verdicts = await verifyPublishAccess(
      context,
      [plan],
      createPackageManager('npm')
    )

    expect(verdicts.get(plan)).toBe('unknown')
    expect(permissionWarnings()).toHaveLength(1)
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
      createPackageManager('npm')
    )

    expect(verdicts.get(plan)).toBe('allowed')

    expect(execCommand.mock.calls.map((call) => call[1])).toEqual([
      ['view', '@scope/pkg', '--json', '--registry', NPMJS],
      ['whoami', '--registry', NPMJS],
      [
        'access',
        'ls-collaborators',
        '@scope/pkg',
        '--json',
        '--registry',
        NPMJS,
      ],
    ])
  })
})

test('denies publishing a scoped package when the collaborator list grants only read access', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_TOKEN: 'mock-npm-token' }

    const plan = createPlan({ name: '@scope/pkg' })

    mockRegistry({
      whoami: 'mock-user',
      packument: maintainedBy('other-user'),
      collaborators: JSON.stringify({ 'mock-user': 'read' }),
    })

    await expect(
      verifyPublishAccess(context, [plan], createPackageManager('npm'))
    ).rejects.toThrow(
      'Missing publish permission for "@scope/pkg@1.2.3" (https://registry.npmjs.org/).'
    )
  })
})

test('denies publishing a scoped package when collaborator access entries are not strings', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_TOKEN: 'mock-npm-token' }

    const plan = createPlan({ name: '@scope/pkg' })

    mockRegistry({
      whoami: 'mock-user',
      packument: maintainedBy('other-user'),
      collaborators: JSON.stringify({ someone: 123 }),
    })

    await expect(
      verifyPublishAccess(context, [plan], createPackageManager('npm'))
    ).rejects.toThrow(
      'Missing publish permission for "@scope/pkg@1.2.3" (https://registry.npmjs.org/).'
    )
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
      collaborators: JSON.stringify({ 'scope:devs': 'write' }),
      team: JSON.stringify(['mock-user']),
    })

    const verdicts = await verifyPublishAccess(
      context,
      [plan],
      createPackageManager('npm')
    )

    expect(verdicts.get(plan)).toBe('allowed')

    expect(execCommand.mock.calls.map((call) => call[1])).toEqual([
      ['view', '@scope/pkg', '--json', '--registry', NPMJS],
      ['whoami', '--registry', NPMJS],
      [
        'access',
        'ls-collaborators',
        '@scope/pkg',
        '--json',
        '--registry',
        NPMJS,
      ],
      ['team', 'ls', 'scope:devs', '--json', '--registry', NPMJS],
    ])
  })
})

test('denies publishing a scoped package when the identity belongs to no write team', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_TOKEN: 'mock-npm-token' }

    const plan = createPlan({ name: '@scope/pkg' })

    mockRegistry({
      whoami: 'mock-user',
      packument: maintainedBy('other-user'),
      collaborators: JSON.stringify({
        'scope:devs': 'write',
        'other-user': 'write',
      }),
      team: JSON.stringify(['other-user']),
    })

    await expect(
      verifyPublishAccess(context, [plan], createPackageManager('npm'))
    ).rejects.toThrow(
      'Missing publish permission for "@scope/pkg@1.2.3" (https://registry.npmjs.org/).'
    )
  })
})

test('warns when the collaborator list cannot be read', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_TOKEN: 'mock-npm-token' }

    const plan = createPlan({ name: '@scope/pkg' })

    mockRegistry({
      whoami: 'mock-user',
      packument: maintainedBy('other-user'),
      collaborators: new Error('network unreachable'),
    })

    const verdicts = await verifyPublishAccess(
      context,
      [plan],
      createPackageManager('npm')
    )

    expect(verdicts.get(plan)).toBe('unknown')

    expect(
      permissionWarnings().filter((message) =>
        message.includes(
          'Could not verify publish permission for "@scope/pkg@1.2.3"'
        )
      )
    ).toHaveLength(1)
  })
})

test('warns when the collaborator list is valid JSON but not an object', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_TOKEN: 'mock-npm-token' }

    const plan = createPlan({ name: '@scope/pkg' })

    mockRegistry({
      whoami: 'mock-user',
      packument: maintainedBy('other-user'),
      collaborators: 'null',
    })

    const verdicts = await verifyPublishAccess(
      context,
      [plan],
      createPackageManager('npm')
    )

    expect(verdicts.get(plan)).toBe('unknown')
    expect(permissionWarnings()).toHaveLength(1)
  })
})

test('warns when the collaborator list cannot be parsed', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_TOKEN: 'mock-npm-token' }

    const plan = createPlan({ name: '@scope/pkg' })

    mockRegistry({
      whoami: 'mock-user',
      packument: maintainedBy('other-user'),
      collaborators: 'not-json',
    })

    const verdicts = await verifyPublishAccess(
      context,
      [plan],
      createPackageManager('npm')
    )

    expect(verdicts.get(plan)).toBe('unknown')
    expect(permissionWarnings()).toHaveLength(1)
  })
})

test('warns when a write team member list is valid JSON but not an array', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_TOKEN: 'mock-npm-token' }

    const plan = createPlan({ name: '@scope/pkg' })

    mockRegistry({
      whoami: 'mock-user',
      packument: maintainedBy('other-user'),
      collaborators: JSON.stringify({ 'scope:devs': 'write' }),
      team: JSON.stringify({ 'mock-user': 'member' }),
    })

    const verdicts = await verifyPublishAccess(
      context,
      [plan],
      createPackageManager('npm')
    )

    expect(verdicts.get(plan)).toBe('unknown')
    expect(permissionWarnings()).toHaveLength(1)
  })
})

test('rejects when the identity lookup reports invalid credentials', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_TOKEN: 'mock-npm-token' }

    const requestError = unauthorizedError('whoami')

    mockRegistry({
      whoami: requestError,
      packument: maintainedBy('other-user'),
    })

    const error: unknown = await verifyPublishAccess(
      context,
      [createPlan({ name: 'a' })],
      createPackageManager('npm')
    ).catch((err: unknown) => err)

    expect(error).toMatchInlineSnapshot(
      `[Error: NPM_TOKEN or ambient registry credentials are invalid or expired.]`
    )
    expect((error as Error).cause).toBe(requestError)
  })
})

test('rejects when the registry metadata lookup reports invalid credentials', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_TOKEN: 'mock-npm-token' }

    const requestError = unauthorizedError('view a')

    mockRegistry({ packument: requestError })

    const error: unknown = await verifyPublishAccess(
      context,
      [createPlan({ name: 'a' })],
      createPackageManager('npm')
    ).catch((err: unknown) => err)

    expect(error).toMatchInlineSnapshot(
      `[Error: NPM_TOKEN or ambient registry credentials are invalid or expired.]`
    )
    expect((error as Error).cause).toBe(requestError)
  })
})

test('rejects when the collaborator lookup reports invalid credentials', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_TOKEN: 'mock-npm-token' }

    const requestError = unauthorizedError('ls-collaborators @scope/pkg')

    mockRegistry({
      whoami: 'mock-user',
      packument: maintainedBy('other-user'),
      collaborators: requestError,
    })

    const error: unknown = await verifyPublishAccess(
      context,
      [createPlan({ name: '@scope/pkg' })],
      createPackageManager('npm')
    ).catch((err: unknown) => err)

    expect(error).toMatchInlineSnapshot(
      `[Error: NPM_TOKEN or ambient registry credentials are invalid or expired.]`
    )
    expect((error as Error).cause).toBe(requestError)
  })
})

test('rejects when the team member lookup reports invalid credentials', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_TOKEN: 'mock-npm-token' }

    const requestError = unauthorizedError('team ls scope:devs')

    mockRegistry({
      whoami: 'mock-user',
      packument: maintainedBy('other-user'),
      collaborators: JSON.stringify({ 'scope:devs': 'write' }),
      team: requestError,
    })

    const error: unknown = await verifyPublishAccess(
      context,
      [createPlan({ name: '@scope/pkg' })],
      createPackageManager('npm')
    ).catch((err: unknown) => err)

    expect(error).toMatchInlineSnapshot(
      `[Error: NPM_TOKEN or ambient registry credentials are invalid or expired.]`
    )
    expect((error as Error).cause).toBe(requestError)
  })
})

test('rejects when the organization roster lookup reports invalid credentials', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_TOKEN: 'mock-npm-token' }

    const requestError = unauthorizedError('org ls scope')

    mockRegistry({
      whoami: 'mock-user',
      packument: notFoundError('@scope/new'),
      org: requestError,
    })

    const error: unknown = await verifyPublishAccess(
      context,
      [createPlan({ name: '@scope/new' })],
      createPackageManager('npm')
    ).catch((err: unknown) => err)

    expect(error).toMatchInlineSnapshot(
      `[Error: NPM_TOKEN or ambient registry credentials are invalid or expired.]`
    )
    expect((error as Error).cause).toBe(requestError)
  })
})

test('warns when the registry metadata cannot be read', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_TOKEN: 'mock-npm-token' }

    const plan = createPlan({ name: 'a' })

    mockRegistry({ packument: new Error('network unreachable') })

    const verdicts = await verifyPublishAccess(
      context,
      [plan],
      createPackageManager('npm')
    )

    expect(verdicts.get(plan)).toBe('unknown')
    expect(permissionWarnings()).toHaveLength(1)
  })
})

test('warns when the registry metadata cannot be parsed', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_TOKEN: 'mock-npm-token' }

    const plan = createPlan({ name: 'a' })

    mockRegistry({ packument: 'not-json' })

    const verdicts = await verifyPublishAccess(
      context,
      [plan],
      createPackageManager('npm')
    )

    expect(verdicts.get(plan)).toBe('unknown')
    expect(permissionWarnings()).toHaveLength(1)
  })
})

test('warns when the registry metadata is valid JSON but not an object', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_TOKEN: 'mock-npm-token' }

    const plan = createPlan({ name: 'a' })

    mockRegistry({ packument: 'null' })

    const verdicts = await verifyPublishAccess(
      context,
      [plan],
      createPackageManager('npm')
    )

    expect(verdicts.get(plan)).toBe('unknown')
    expect(permissionWarnings()).toHaveLength(1)
  })
})

test('warns when the identity lookup returns no username', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_TOKEN: 'mock-npm-token' }

    const plan = createPlan({ name: 'a' })

    mockRegistry({
      whoami: '',
      packument: maintainedBy('mock-user'),
    })

    const verdicts = await verifyPublishAccess(
      context,
      [plan],
      createPackageManager('npm')
    )

    expect(verdicts.get(plan)).toBe('unknown')
    expect(permissionWarnings()).toHaveLength(1)
  })
})

test('warns for every package without running commands when only OIDC tokens are available', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_ID_TOKEN: 'mock-id-token' }

    const first = createPlan({ name: 'a' })
    const second = createPlan({ name: 'b', version: '2.0.0' })

    const verdicts = await verifyPublishAccess(
      context,
      [first, second],
      createPackageManager('npm')
    )

    expect(verdicts.get(first)).toBe('unknown')
    expect(verdicts.get(second)).toBe('unknown')
    expect(execCommand).not.toHaveBeenCalled()

    expect(
      permissionWarnings().filter((message) =>
        message.includes('Could not verify publish permission for')
      )
    ).toHaveLength(2)
  })
})

test('warns without running commands when NPM_TOKEN and OIDC tokens are both available', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = {
      NPM_TOKEN: 'mock-npm-token',
      NPM_ID_TOKEN: 'mock-id-token',
    }

    const plan = createPlan({ name: 'a' })

    const verdicts = await verifyPublishAccess(
      context,
      [plan],
      createPackageManager('npm')
    )

    expect(verdicts.get(plan)).toBe('unknown')
    expect(execCommand).not.toHaveBeenCalled()
    expect(permissionWarnings()).toHaveLength(1)
  })
})

test('checks NPM_TOKEN credentials for plans on other registries when OIDC tokens are available', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = {
      NPM_TOKEN: 'mock-npm-token',
      NPM_ID_TOKEN: 'mock-id-token',
    }

    await writeFile(
      path.join(cwd, 'package.json'),
      JSON.stringify({
        name: 'a',
        version: '1.2.3',
        publishConfig: { registry: 'https://npm.example.com/' },
      })
    )

    const plan = createPlan({ name: 'a' })

    mockRegistry({
      whoami: 'mock-user',
      packument: maintainedBy('mock-user'),
    })

    const verdicts = await verifyPublishAccess(
      context,
      [plan],
      createPackageManager('npm')
    )

    expect(verdicts.get(plan)).toBe('allowed')
    expect(warnCalls()).toHaveLength(0)
  })
})

test('warns for plans on other registries without credentials when only OIDC tokens are available', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_ID_TOKEN: 'mock-id-token' }

    await writeFile(
      path.join(cwd, 'package.json'),
      JSON.stringify({
        name: 'a',
        version: '1.2.3',
        publishConfig: { registry: 'https://npm.example.com/' },
      })
    )

    const plan = createPlan({ name: 'a' })

    const verdicts = await verifyPublishAccess(
      context,
      [plan],
      createPackageManager('npm')
    )

    expect(verdicts.get(plan)).toBe('unknown')
    expect(execCommand).not.toHaveBeenCalled()

    expect(
      warnCalls().filter((message) =>
        message.includes(
          'Could not verify publish permission for "a@1.2.3": the registry will reject the publish if access is missing.'
        )
      )
    ).toHaveLength(1)
  })
})

test('stays silent for plans whose trusted publishing was already verified', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_ID_TOKEN: 'mock-id-token' }

    await writeFile(
      path.join(cwd, 'package.json'),
      JSON.stringify({ name: 'a', version: '1.2.3' })
    )

    const plan = createPlan({ name: 'a' })

    const verdicts = await verifyPublishAccess(
      context,
      [plan],
      createPackageManager('npm'),
      PLUGIN_NAME,
      new Set([plan])
    )

    expect(verdicts.get(plan)).toBe('unknown')
    expect(execCommand).not.toHaveBeenCalled()
    expect(warnCalls()).toHaveLength(0)
  })
})

test('warns for plans missing from the verified trusted publishing set', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_ID_TOKEN: 'mock-id-token' }

    await writeFile(
      path.join(cwd, 'package.json'),
      JSON.stringify({ name: 'a', version: '1.2.3' })
    )

    const verified = createPlan({ name: 'verified-a' })
    const plan = createPlan({ name: 'a' })

    const verdicts = await verifyPublishAccess(
      context,
      [plan],
      createPackageManager('npm'),
      PLUGIN_NAME,
      new Set([verified])
    )

    expect(verdicts.get(plan)).toBe('unknown')
    expect(execCommand).not.toHaveBeenCalled()
    expect(warnCalls()).toHaveLength(1)
  })
})

test('verifies the injected token when NPM_TOKEN and OIDC tokens are both available and Yarn is active', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = {
      NPM_TOKEN: 'mock-npm-token',
      NPM_ID_TOKEN: 'mock-id-token',
    }

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
      ['yarn', ['npm', 'whoami', '--publish']],
    ])
  })
})

test('warns without running commands when no registry credentials are available', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = {}

    const plan = createPlan({ name: 'a' })

    const verdicts = await verifyPublishAccess(
      context,
      [plan],
      createPackageManager('npm')
    )

    expect(verdicts.get(plan)).toBe('unknown')
    expect(permissionWarnings()).toHaveLength(1)
    expect(execCommand).not.toHaveBeenCalled()
  })
})

test('allows publishing with ambient credentials without token injection', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = {}

    await writeFile(
      path.join(cwd, '.npmrc'),
      '//registry.npmjs.org/:_authToken=mock-ambient-token'
    )

    const plan = createPlan({ name: 'a' })

    mockRegistry({
      whoami: 'mock-user',
      packument: maintainedBy('mock-user'),
    })

    const verdicts = await verifyPublishAccess(
      context,
      [plan],
      createPackageManager('npm')
    )

    expect(verdicts.get(plan)).toBe('allowed')

    expect(execCommand.mock.calls).toEqual([
      [
        'npm',
        ['view', 'a', '--json', '--registry', NPMJS],
        { cwd, env: {}, signal: undefined },
      ],
      [
        'npm',
        ['whoami', '--registry', NPMJS],
        { cwd, env: {}, signal: undefined },
      ],
    ])
  })
})

test('allows publishing a scoped package with ambient credentials through the collaborator list', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = {}

    await writeFile(
      path.join(cwd, '.npmrc'),
      '//registry.npmjs.org/:_authToken=mock-ambient-token'
    )

    const plan = createPlan({ name: '@scope/pkg' })

    mockRegistry({
      whoami: 'mock-user',
      packument: maintainedBy('other-user'),
      collaborators: JSON.stringify({ 'mock-user': 'write' }),
    })

    const verdicts = await verifyPublishAccess(
      context,
      [plan],
      createPackageManager('npm')
    )

    expect(verdicts.get(plan)).toBe('allowed')

    expect(execCommand.mock.calls.map((call) => call[1])).toEqual([
      ['view', '@scope/pkg', '--json', '--registry', NPMJS],
      ['whoami', '--registry', NPMJS],
      [
        'access',
        'ls-collaborators',
        '@scope/pkg',
        '--json',
        '--registry',
        NPMJS,
      ],
    ])
  })
})

test('skips private, unnamed, unversioned, and foreign-provider plans', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_TOKEN: 'mock-npm-token' }

    const complete = createPlan({ name: 'a' })

    const plans = [
      createPlan({ name: 'private', isPrivate: true }),
      createPlan(),
      createPlan({ name: 'unversioned', hasRelease: false }),
      createPlan({ name: 'foreign', provider: '@reelout/cargo' }),
      complete,
    ]

    mockRegistry({
      whoami: 'mock-user',
      packument: maintainedBy('mock-user'),
    })

    const verdicts = await verifyPublishAccess(
      context,
      plans,
      createPackageManager('npm')
    )

    expect(verdicts.size).toBe(1)
    expect(verdicts.get(complete)).toBe('allowed')
  })
})

test('resolves the identity once per registry across plans', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_TOKEN: 'mock-npm-token' }

    const first = createPlan({ name: 'a' })
    const second = createPlan({ name: 'b', version: '2.0.0' })

    mockRegistry({
      whoami: 'mock-user',
      packument: maintainedBy('mock-user'),
    })

    const verdicts = await verifyPublishAccess(
      context,
      [first, second],
      createPackageManager('npm')
    )

    expect(verdicts.get(first)).toBe('allowed')
    expect(verdicts.get(second)).toBe('allowed')

    expect(
      execCommand.mock.calls.filter((call) =>
        (call[1] as readonly string[]).includes('whoami')
      )
    ).toHaveLength(1)
  })
})

test('resolves the identity once per scope for Yarn Berry plans on the same registry', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_TOKEN: 'mock-npm-token' }

    const first = createPlan({ name: '@scope/first' })
    const second = createPlan({ name: '@scope/second', version: '2.0.0' })

    mockRegistry({
      whoami: 'mock-user',
      packument: maintainedBy('mock-user'),
    })

    const verdicts = await verifyPublishAccess(
      context,
      [first, second],
      createPackageManager('yarn', true)
    )

    expect(verdicts.get(first)).toBe('allowed')
    expect(verdicts.get(second)).toBe('allowed')

    expect(
      execCommand.mock.calls
        .map((call) => call[1] as readonly string[])
        .filter((args) => args.includes('whoami'))
    ).toEqual([['npm', 'whoami', '--scope', 'scope', '--publish']])
  })
})

test('resolves the identity per scope for Yarn Berry plans with different scopes', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_TOKEN: 'mock-npm-token' }

    const first = createPlan({ name: '@scope/first' })
    const second = createPlan({ name: '@other/second', version: '2.0.0' })

    mockRegistry({
      whoami: 'mock-user',
      packument: maintainedBy('mock-user'),
    })

    const verdicts = await verifyPublishAccess(
      context,
      [first, second],
      createPackageManager('yarn', true)
    )

    expect(verdicts.get(first)).toBe('allowed')
    expect(verdicts.get(second)).toBe('allowed')

    expect(
      execCommand.mock.calls
        .map((call) => call[1] as readonly string[])
        .filter((args) => args.includes('whoami'))
    ).toEqual([
      ['npm', 'whoami', '--scope', 'scope', '--publish'],
      ['npm', 'whoami', '--scope', 'other', '--publish'],
    ])
  })
})

test('resolves the identity without the scope flag when the manifest pins the publish registry for Yarn Berry', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_TOKEN: 'mock-npm-token' }

    await writeFile(
      path.join(cwd, 'package.json'),
      JSON.stringify({
        name: '@scope/pkg',
        version: '1.2.3',
        publishConfig: { registry: 'https://npm.example.com/' },
      })
    )

    const plan = createPlan({ name: '@scope/pkg' })

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

    expect(
      execCommand.mock.calls
        .map((call) => call[1] as readonly string[])
        .filter((args) => args.includes('whoami'))
    ).toEqual([['npm', 'whoami', '--publish']])
  })
})

test('probes with pnpm view and resolves the identity with pnpm whoami', async () => {
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
      createPackageManager('pnpm')
    )

    expect(verdicts.get(plan)).toBe('allowed')

    expect(execCommand.mock.calls.map((call) => [call[0], call[1]])).toEqual([
      ['pnpm', ['view', 'a', '--json', '--registry', NPMJS]],
      ['pnpm', ['whoami', '--registry', NPMJS]],
    ])
  })
})

test('passes the injected registry token to spawned npm access commands for pnpm workspaces', async () => {
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
      createPackageManager('pnpm')
    )

    expect(verdicts.get(plan)).toBe('allowed')

    expect(execCommand.mock.calls[2]).toEqual([
      'npm',
      [
        'access',
        'ls-collaborators',
        '@scope/pkg',
        '--json',
        '--registry',
        NPMJS,
      ],
      expect.objectContaining({
        env: expect.objectContaining({
          'pnpm_config_//registry.npmjs.org/:_authToken': 'mock-npm-token',
          'npm_config_//registry.npmjs.org/:_authToken': 'mock-npm-token',
        }),
      }),
    ])
  })
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
      ['yarn', ['npm', 'whoami', '--publish']],
    ])
  })
})

test('resolves the Yarn Berry identity from the plan package directory', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_TOKEN: 'mock-npm-token' }

    const plan = createPlan({ name: 'a', location: 'packages/a' })

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

    expect(execCommand.mock.calls[1]).toEqual([
      'yarn',
      ['npm', 'whoami', '--publish'],
      expect.objectContaining({
        cwd: path.resolve(cwd, 'packages/a'),
      }),
    ])
  })
})

test('resolves the Yarn Berry identity separately for each package directory', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    context.cwd = cwd
    context.env = { NPM_TOKEN: 'mock-npm-token' }

    const first = createPlan({ name: 'a', location: 'packages/first' })
    const second = createPlan({ name: 'b', location: 'packages/second' })

    mockRegistry({
      whoami: 'mock-user',
      packument: maintainedBy('mock-user'),
    })

    const verdicts = await verifyPublishAccess(
      context,
      [first, second],
      createPackageManager('yarn', true)
    )

    expect(verdicts.get(first)).toBe('allowed')
    expect(verdicts.get(second)).toBe('allowed')

    const whoamiCwds = execCommand.mock.calls
      .filter((call) => (call[1] as readonly string[]).includes('whoami'))
      .map((call) => (call[2] as { cwd: string }).cwd)

    expect(whoamiCwds).toEqual([
      path.resolve(cwd, 'packages/first'),
      path.resolve(cwd, 'packages/second'),
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
      packument: new Error(
        `Command 'yarn npm info a --json' failed (exit code 1)
Response Code: 404`
      ),
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
      permissionWarnings().filter((message) =>
        message.includes(
          'Could not verify publish permission for "@scope/pkg@1.2.3": the registry will reject the publish if access is missing.'
        )
      )
    ).toHaveLength(1)

    expect(execCommand.mock.calls.map((call) => [call[0], call[1]])).toEqual([
      ['yarn', ['npm', 'info', '@scope/pkg', '--json']],
      ['yarn', ['npm', 'whoami', '--scope', 'scope', '--publish']],
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
      packument: new Error(
        `Command 'yarn npm info @scope/new --json' failed (exit code 1)
Response Code: 404`
      ),
      org: unauthorizedError('org ls scope'),
    })

    const verdicts = await verifyPublishAccess(
      context,
      [plan],
      createPackageManager('yarn', true)
    )

    expect(verdicts.get(plan)).toBe('unknown')

    expect(
      permissionWarnings().filter((message) =>
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
      permissionWarnings().filter((message) =>
        message.includes(
          'Could not verify publish permission for "@scope/pkg@1.2.3": the registry will reject the publish if access is missing.'
        )
      )
    ).toHaveLength(1)
  })
})
