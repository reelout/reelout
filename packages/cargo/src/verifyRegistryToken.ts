// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { ReleaseContext } from '@reelout/core'
import { CARGO_REGISTRY_API, USER_AGENT } from './cratesIoApi'

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
      'CARGO_REGISTRY_TOKEN or stored registry credentials could not be verified.',
      { cause: error }
    )
  }
}
