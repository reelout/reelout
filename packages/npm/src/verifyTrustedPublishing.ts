// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { ReleaseContext, ReleasePlan } from '@reelout/core'
import { formatError } from '@reelout/core'
import { hasOIDCAuth } from './hasAuth'
import type { PackageManagerInfo } from './inspectPackageManager'
import {
  isCompleteReleasePlan,
  type CompleteReleasePlan,
} from './isCompleteReleasePlan'
import { isJsonObject } from './isJsonObject'
import { normalizeRegistry } from './normalizeRegistry'
import {
  DEFAULT_REGISTRY,
  resolvePublishRegistry,
} from './resolvePublishRegistry'

/** The OIDC audience of the public npm registry's trusted-publishing tokens. */
const TRUSTED_PUBLISHING_AUDIENCE = 'npm:registry.npmjs.org'

/**
 * Verify OIDC trusted publishing for release plans before anything is
 * published.
 *
 * Exchanges the OIDC identity token for a short-lived registry token per
 * package against the public npm registry's trusted-publishing endpoint and
 * discards the exchanged token: the check only confirms that the registry
 * would issue one, while the publish itself authenticates through the
 * package manager's own OIDC support. Runs only when no `NPM_TOKEN` is
 * configured, OIDC environment tokens exist, the package manager is npm or
 * pnpm, and at least one complete plan targets the public npm registry;
 * every other combination is skipped without verification. Fails the
 * release when the identity token cannot be retrieved or an exchange is
 * rejected, before a single package is published.
 *
 * @param context Release context containing environment and working directory
 * @param plans Release plans to verify
 * @param packageManager Information about the active package manager
 * @returns A promise that resolves when every plan's trusted publishing is
 * verified
 * @throws If any plan's trusted-publishing token exchange was rejected
 */
export async function verifyTrustedPublishing(
  context: ReleaseContext,
  plans: readonly ReleasePlan[],
  packageManager: PackageManagerInfo
): Promise<void> {
  if (context.env.NPM_TOKEN?.trim()) {
    return
  }

  if (!hasOIDCAuth(context.env)) {
    return
  }

  if (!packageManager.isNpm && !packageManager.isPnpm) {
    context.logger.debug(
      'Trusted publishing was not verified: the package manager does not support OIDC authentication.'
    )

    return
  }

  const targets: CompleteReleasePlan[] = []

  for (const plan of plans) {
    if (!isCompleteReleasePlan(plan)) {
      continue
    }

    const registry = await resolvePublishRegistry(
      context,
      plan.package,
      packageManager
    )

    if (normalizeRegistry(registry) === DEFAULT_REGISTRY) {
      targets.push(plan)
    }
  }

  if (targets.length === 0) {
    context.logger.debug(
      'Trusted publishing was not verified: no package targets the public npm registry.'
    )

    return
  }

  const identityToken = await resolveIdentityToken(context)

  const failures: string[] = []

  for (const plan of targets) {
    const target = `${plan.package.name}@${plan.release.version}`

    try {
      await exchangeTrustedPublishingToken(
        context,
        identityToken,
        plan.package.name
      )
    } catch (error) {
      failures.push(`"${target}" (${formatError(error)})`)
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `Trusted publishing could not be verified for ${failures.join(', ')}.`
    )
  }

  context.logger.info(
    `Trusted publishing verified for ${targets
      .map((plan) => `"${plan.package.name}@${plan.release.version}"`)
      .join(', ')}.`
  )
}

/**
 * Resolve the OIDC identity token for the trusted-publishing audience.
 *
 * Returns a pre-issued `NPM_ID_TOKEN` when configured and otherwise requests
 * a fresh identity token from the GitHub Actions endpoint, scoped to the
 * public npm registry's trusted-publishing audience.
 *
 * @param context Release context containing environment and working directory
 * @returns The OIDC identity token
 * @throws If no identity token source is configured, or GitHub Actions
 * returned no usable identity token
 */
async function resolveIdentityToken(context: ReleaseContext): Promise<string> {
  const identityToken = context.env.NPM_ID_TOKEN?.trim()

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

  if (!isJsonObject(body) || typeof body.value !== 'string' || !body.value) {
    throw new Error(
      'OIDC identity token could not be retrieved from GitHub Actions: the response carries no identity token.'
    )
  }

  return body.value
}

/**
 * Exchange the OIDC identity token for one package's trusted-publishing
 * token.
 *
 * Posts to the public npm registry's trusted-publishing token exchange
 * endpoint and ignores the returned short-lived token, because the publish
 * itself authenticates through the package manager's own OIDC support.
 *
 * @param context Release context containing environment and working directory
 * @param identityToken The OIDC identity token to exchange
 * @param name The name of the package being verified
 * @returns A promise that resolves when the registry accepts the token
 * exchange
 * @throws If the registry rejected the token exchange
 */
async function exchangeTrustedPublishingToken(
  context: ReleaseContext,
  identityToken: string,
  name: string
): Promise<void> {
  const endpoint = `${DEFAULT_REGISTRY}-/npm/v1/oidc/token/exchange/package/${encodeURIComponent(name)}`

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { authorization: `Bearer ${identityToken}` },
    ...(context.signal ? { signal: context.signal } : {}),
  })

  if (response.ok) {
    return
  }

  const body: unknown = await response.json().catch(() => undefined)

  const detail =
    isJsonObject(body) && typeof body.error === 'string' && body.error
      ? `: ${body.error}`
      : ''

  throw new Error(`HTTP ${response.status}${detail}`)
}
