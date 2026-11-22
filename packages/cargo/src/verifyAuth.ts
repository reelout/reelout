// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { ReleaseContext } from '@reelout/core'
import fs from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { parse } from 'smol-toml'
import { version } from '../package.json'

/** The base URL of the crates.io registry API. */
export const CARGO_REGISTRY_API = 'https://crates.io/api/v1'

/** The user agent sent to crates.io endpoints. */
export const USER_AGENT = `reelout-cargo/${version} (+https://github.com/reelout/reelout)`

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

  const registry =
    typeof data === 'object' && data !== null
      ? (data as { registry?: unknown }).registry
      : undefined

  const token =
    typeof registry === 'object' && registry !== null
      ? (registry as { token?: unknown }).token
      : undefined

  return typeof token === 'string' && token.trim() ? token.trim() : undefined
}

/**
 * Verify the crates.io registry token and resolve the authenticated login.
 *
 * Queries the crates.io `me` endpoint with a compliant user agent and a
 * bearer token, so expired or revoked tokens fail before any crate is
 * published. The resolved login is cached by the caller and reused for
 * publish-access checks.
 *
 * @param context Release context containing the abort signal
 * @param token The crates.io registry token to verify
 * @returns The login name of the authenticated registry user
 * @throws If the token is rejected or the account could not be read
 */
export async function verifyRegistryToken(
  context: Pick<ReleaseContext, 'signal'>,
  token: string
): Promise<string> {
  try {
    const response = await fetch(`${CARGO_REGISTRY_API}/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': USER_AGENT,
      },
      ...(context.signal ? { signal: context.signal } : {}),
    })

    if (!response.ok) {
      throw new Error(`The registry responded with HTTP ${response.status}.`)
    }

    const data: unknown = await response.json()

    const user =
      typeof data === 'object' && data !== null
        ? (data as { user?: unknown }).user
        : undefined

    const login =
      typeof user === 'object' && user !== null
        ? (user as { login?: unknown }).login
        : undefined

    if (typeof login !== 'string' || !login) {
      throw new Error('The registry account could not be read.')
    }

    return login
  } catch (error) {
    throw new Error(
      'The CARGO_REGISTRY_TOKEN environment variable could not be verified.',
      { cause: error }
    )
  }
}
