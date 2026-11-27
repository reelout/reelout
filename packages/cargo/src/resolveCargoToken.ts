// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { formatError, type ReleaseContext } from '@reelout/core'
import fs from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { parse } from 'smol-toml'

/** Read `credentials.toml` inside the given cargo home directory. */
function credentialsFilePath(cargoHome: string): string {
  return path.join(cargoHome, 'credentials.toml')
}

/**
 * Resolve the crates.io registry token for a release.
 *
 * Prefers a non-empty `CARGO_REGISTRY_TOKEN` environment variable, then
 * falls back to the `token` value under `[registry]` in the cargo
 * credentials file, `$CARGO_HOME/credentials.toml` (default
 * `~/.cargo/credentials.toml`). A credentials file that exists but is not
 * valid TOML resolves to no token and logs a debug message. The resolved
 * token is passed through to `cargo` commands untouched; it is never
 * written or logged.
 *
 * @param context Release context containing environment variables and logger
 * @returns The resolved token, or undefined when no credentials exist
 */
export async function resolveCargoToken(
  context: Pick<ReleaseContext, 'env' | 'logger'>
): Promise<string | undefined> {
  const envToken = context.env.CARGO_REGISTRY_TOKEN?.trim()

  if (envToken) {
    return envToken
  }

  let credentials: string

  try {
    credentials = await fs.readFile(
      credentialsFilePath(
        context.env.CARGO_HOME ??
          path.join(context.env.HOME ?? homedir(), '.cargo')
      ),
      'utf-8'
    )
  } catch {
    return undefined
  }

  let data: unknown

  try {
    data = parse(credentials)
  } catch (error) {
    context.logger.debug(
      `Cargo credentials could not be parsed: ${formatError(error)}`
    )

    return undefined
  }

  const registry = (data as { registry?: unknown }).registry

  const token =
    typeof registry === 'object' && registry !== null
      ? (registry as { token?: unknown }).token
      : undefined

  return typeof token === 'string' && token.trim() ? token.trim() : undefined
}
