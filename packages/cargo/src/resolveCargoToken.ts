// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { ReleaseContext } from '@reelout/core'
import fs from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { parse } from 'smol-toml'

/** Read `~/.cargo/credentials.toml` relative to the given HOME directory. */
function credentialsFilePath(home: string): string {
  return path.join(home, '.cargo', 'credentials.toml')
}

/**
 * Resolve the crates.io registry token for a release.
 *
 * Prefers a non-empty `CARGO_REGISTRY_TOKEN` environment variable, then
 * falls back to the `token` value under `[registry]` in
 * `~/.cargo/credentials.toml`. The resolved token is passed through to
 * `cargo` commands untouched; it is never written or logged.
 *
 * @param context Release context containing environment variables
 * @returns The resolved token, or undefined when no credentials exist
 */
export async function resolveCargoToken(
  context: Pick<ReleaseContext, 'env'>
): Promise<string | undefined> {
  const envToken = context.env.CARGO_REGISTRY_TOKEN?.trim()

  if (envToken) {
    return envToken
  }

  let credentials: string

  try {
    credentials = await fs.readFile(
      credentialsFilePath(context.env.HOME ?? homedir()),
      'utf-8'
    )
  } catch {
    return undefined
  }

  let data: unknown

  try {
    data = parse(credentials)
  } catch {
    return undefined
  }

  const registry = (data as { registry?: unknown }).registry

  const token =
    typeof registry === 'object' && registry !== null
      ? (registry as { token?: unknown }).token
      : undefined

  return typeof token === 'string' && token.trim() ? token.trim() : undefined
}
