// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import Config from '@npmcli/config'
import defaultOptions from '@npmcli/config/lib/definitions/index.js'
import { realpath } from 'node:fs/promises'
import { resolve } from 'node:path'

export interface LoadConfigOptions {
  env?: Readonly<NodeJS.ProcessEnv> | undefined
}

/**
 * Load npm configuration settings for a given directory.
 *
 * Resolves the system npm binary path to initialize an `@npmcli/config`
 * instance, loading options from `.npmrc` files and environment variables.
 * `HOME` and `PATH` fall back to the current process environment only when
 * the provided environment leaves them unset.
 *
 * @param cwd Working directory path to search for config files
 * @param options Runtime environment and configuration settings
 * @returns Loaded npm configuration instance
 */
export async function loadConfig(
  cwd: string,
  options: LoadConfigOptions
): Promise<Config> {
  let npmBin: string

  try {
    npmBin = await realpath(resolve(process.execPath, '..', 'npm'))
  } catch (error) {
    throw new Error(
      `The npm CLI could not be resolved next to the Node.js executable at "${process.execPath}".`,
      { cause: error }
    )
  }

  const npmPath = resolve(npmBin, '..', '..')

  const config = new Config({
    ...defaultOptions,
    npmPath,
    cwd,
    env: {
      ...options.env,
      HOME: options.env?.HOME ?? process.env.HOME,
      PATH: options.env?.PATH ?? process.env.PATH,
    },
  })

  await config.load()

  return config
}
