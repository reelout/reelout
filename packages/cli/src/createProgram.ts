// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { resolveConfig } from '@reelout/config'
import { createContext } from '@reelout/context'
import {
  compact,
  createPlugin,
  executeReleaseWorkflow,
  isTruthyString,
  type ReleaseTypeHint,
} from '@reelout/core'
import { Command, Option } from 'commander'
import type { ConsolaInstance } from 'consola/core'

export interface CreateProgramOptions {
  name: string
  version?: string | undefined
  description?: string | undefined
  cwd: string
  env: Readonly<NodeJS.ProcessEnv>
  signal?: AbortSignal | undefined
  stdout: NodeJS.WritableStream
  stderr: NodeJS.WritableStream
  logger?: ConsolaInstance | undefined
}

interface Flags {
  type?: ReleaseTypeHint | undefined
  qualifier?: boolean | string | undefined
  channel?: boolean | string | undefined
  allowEmpty?: boolean | undefined
  dryRun?: boolean | undefined
  debug?: boolean | undefined
}

/**
 * Create and configure a command-line program instance.
 *
 * Resolves project configuration settings, registers command-line options,
 * and sets up execution handlers alongside version and help flags.
 *
 * @param options Options for configuring the command-line execution context
 * @returns A promise that resolves to the configured `Command` instance
 */
export async function createProgram(
  options: CreateProgramOptions
): Promise<Command> {
  const { name, version, description } = options

  const { cwd, env } = options

  const { plugins, ...config } = await resolveConfig(cwd, name)

  const program = new Command(name)

  if (description) {
    program.description(description)
  }

  program
    .addOption(
      new Option(
        '--type <string>',
        'Choose a release type instead of deriving it from commits; use `auto` to analyze commits.'
      ).choices(['auto', 'major', 'minor', 'patch'] satisfies ReleaseTypeHint[])
    )
    .option(
      '--qualifier <boolean or string>',
      'Set the SemVer prerelease identifier (for example, `beta`); use `false` to disable it or `true` to follow branch rules.',
      (value) => (value === 'true' ? true : value === 'false' ? false : value)
    )
    .option(
      '--channel <boolean or string>',
      'Set the npm dist-tag (for example, `beta`); use `false` to disable it or `true` to follow branch rules.',
      (value) => (value === 'true' ? true : value === 'false' ? false : value)
    )
    .option(
      '--allow-empty',
      'Run the release workflow even when no releasable changes are detected.'
    )
    .option(
      '--dry-run',
      'Preview the release without writing files, creating commits or tags, or publishing packages or releases.'
    )
    .option(
      '--debug',
      'Enable verbose logging for troubleshooting.',
      isTruthyString(env.RUNNER_DEBUG) || isTruthyString(env.ACTIONS_STEP_DEBUG)
    )
    .action(async (flags: Flags) => {
      await executeReleaseWorkflow(
        await createContext({ ...options, ...config, ...flags }),
        compact(await Promise.all(plugins.map(createPlugin)))
      )
    })

  if (version) {
    program.version(version, '-v, --version', 'Display the version number.')
  }

  program.helpOption('-h, --help', 'Display command usage and options.')

  return program
}
