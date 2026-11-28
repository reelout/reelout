// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { ReleaseContext } from '@reelout/core'
import { formatError } from '@reelout/core'
import { CARGO_REGISTRY_API, USER_AGENT } from './cratesIoApi'
import { isJsonObject } from './isJsonObject'

/** The OIDC audience of the crates.io trusted-publishing identity tokens. */
const TRUSTED_PUBLISHING_AUDIENCE = 'crates.io'

/**
 * Verify OIDC trusted publishing for the release and resolve its publish
 * token.
 *
 * Exchanges the GitHub Actions OIDC identity token for a short-lived
 * crates.io publish token at the registry's trusted-publishing endpoint.
 * Unlike the npm registry, the exchanged token is returned to the caller
 * and injected into `cargo publish` as `CARGO_REGISTRY_TOKEN`, because
 * cargo cannot exchange the single-use identity token itself. Identity
 * and publish tokens are trimmed of surrounding whitespace at every
 * boundary they cross. Fails the release when the identity token cannot
 * be retrieved or the registry rejects the exchange.
 *
 * @param context Release context containing environment, logger, and abort
 * signal
 * @returns The short-lived crates.io publish token
 * @throws If the identity token could not be retrieved or the registry
 * rejected the token exchange
 */
export async function verifyTrustedPublishing(
  context: ReleaseContext
): Promise<string> {
  const identityToken = await resolveIdentityToken(context)

  try {
    const token = await exchangeTrustedPublishingToken(context, identityToken)

    context.logger.info('Trusted publishing verified for this repository.')

    return token
  } catch (error) {
    throw new Error(
      `Trusted publishing could not be verified: ${formatError(error)}`,
      { cause: error }
    )
  }
}

/**
 * Determine whether trusted-publishing environment tokens are configured.
 *
 * Detects a pre-issued `CARGO_ID_TOKEN` or a GitHub Actions OIDC token
 * pair without reading configuration files.
 *
 * @param env Environment variables to inspect
 * @returns True if trusted-publishing environment tokens exist, otherwise
 * false
 */
export function hasTrustedPublishingAuth(
  env: Readonly<NodeJS.ProcessEnv>
): boolean {
  if (env.CARGO_ID_TOKEN) {
    return true
  }

  if (env.ACTIONS_ID_TOKEN_REQUEST_URL && env.ACTIONS_ID_TOKEN_REQUEST_TOKEN) {
    return true
  }

  return false
}

/**
 * Resolve the OIDC identity token for the trusted-publishing audience.
 *
 * Returns a pre-issued `CARGO_ID_TOKEN` when configured and otherwise
 * requests a fresh identity token from the GitHub Actions endpoint, scoped
 * to the crates.io trusted-publishing audience.
 *
 * @param context Release context containing environment and abort signal
 * @returns The OIDC identity token
 * @throws If no identity token source is configured, or GitHub Actions
 * returned no usable identity token
 */
async function resolveIdentityToken(context: ReleaseContext): Promise<string> {
  const identityToken = context.env.CARGO_ID_TOKEN?.trim()

  if (identityToken) {
    return identityToken
  }

  const requestUrl = context.env.ACTIONS_ID_TOKEN_REQUEST_URL

  const requestToken = context.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN

  if (!requestUrl || !requestToken) {
    throw new Error('OIDC identity token is not available.')
  }

  let response: Response

  try {
    const url = new URL(requestUrl)

    url.searchParams.set('audience', TRUSTED_PUBLISHING_AUDIENCE)

    response = await fetch(url, {
      headers: { authorization: `Bearer ${requestToken}` },
      ...(context.signal ? { signal: context.signal } : {}),
    })
  } catch (error) {
    throw new Error(
      `OIDC identity token could not be retrieved from GitHub Actions: ${formatError(error)}`,
      { cause: error }
    )
  }

  if (!response.ok) {
    throw new Error(
      `OIDC identity token could not be retrieved from GitHub Actions: HTTP ${response.status}.`
    )
  }

  const body: unknown = await response.json().catch(() => undefined)

  const resolvedIdentityToken =
    isJsonObject(body) && typeof body.value === 'string'
      ? body.value.trim()
      : undefined

  if (!resolvedIdentityToken) {
    throw new Error(
      'OIDC identity token could not be retrieved from GitHub Actions: the response carries no identity token.'
    )
  }

  return resolvedIdentityToken
}

/**
 * Exchange the OIDC identity token for a short-lived crates.io publish
 * token.
 *
 * Posts to the crates.io trusted-publishing token exchange endpoint and
 * returns the issued token, which the caller injects into `cargo publish`
 * as `CARGO_REGISTRY_TOKEN`, because cargo cannot perform the exchange
 * itself.
 *
 * @param context Release context containing abort signal
 * @param identityToken The OIDC identity token to exchange
 * @returns The short-lived crates.io publish token
 * @throws If the registry rejected the token exchange
 */
async function exchangeTrustedPublishingToken(
  context: ReleaseContext,
  identityToken: string
): Promise<string> {
  const response = await fetch(
    `${CARGO_REGISTRY_API}/trusted_publishing/tokens`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
      },
      body: JSON.stringify({ jwt: identityToken }),
      ...(context.signal ? { signal: context.signal } : {}),
    }
  )

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => undefined)

    throw new Error(`HTTP ${response.status}${readErrorDetail(body)}`)
  }

  const body: unknown = await response.json().catch(() => undefined)

  const token =
    isJsonObject(body) && typeof body.token === 'string'
      ? body.token.trim()
      : undefined

  if (!token) {
    throw new Error('the response carries no publish token.')
  }

  return token
}

/**
 * Read the detail of the first error crates.io reported in a rejection.
 *
 * @param body The parsed rejection response body
 * @returns The prefixed error detail, or an empty string when the body
 * reports no usable detail
 */
function readErrorDetail(body: unknown): string {
  if (!isJsonObject(body) || !Array.isArray(body.errors)) {
    return ''
  }

  for (const error of body.errors) {
    if (
      isJsonObject(error) &&
      typeof error.detail === 'string' &&
      error.detail
    ) {
      return `: ${error.detail}`
    }
  }

  return ''
}
