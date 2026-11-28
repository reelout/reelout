// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { ReleaseContext, ReleasePlan } from '@reelout/core'
import { formatError } from '@reelout/core'
import { colors } from 'consola/utils'
import semver from 'semver'
import { getPackageManagerFullVersion } from './getPackageManagerFullVersion'
import {
  hasAuth,
  hasConfiguredAuth,
  hasOIDCAuth,
  MINIMUM_YARN_OIDC_VERSION,
  usesYarnOidcTrustedPublishing,
} from './hasAuth'
import type { PackageManagerInfo } from './inspectPackageManager'
import {
  isCompleteReleasePlan,
  type CompleteReleasePlan,
} from './isCompleteReleasePlan'
import { isJsonObject } from './isJsonObject'
import { normalizeRegistry } from './normalizeRegistry'
import { PLUGIN_NAME } from './PLUGIN_NAME'
import type { PackageManager } from './resolvePackageManager'
import {
  DEFAULT_REGISTRY,
  DEFAULT_YARN_REGISTRY,
  resolvePublishRegistry,
} from './resolvePublishRegistry'

/** The OIDC audience of the public npm registry's trusted-publishing tokens. */
const TRUSTED_PUBLISHING_AUDIENCE = 'npm:registry.npmjs.org'

/** Timeout for trusted-publishing network requests, in milliseconds. */
const REQUEST_TIMEOUT_MS = 30_000

/**
 * Minimum package manager CLI versions that publish with OIDC trusted
 * publishing. `undefined` marks package managers without OIDC support.
 */
const MINIMUM_OIDC_CLI_VERSIONS: Readonly<
  Record<PackageManager, string | undefined>
> = {
  npm: '11.5.1',
  pnpm: '11.0.0',
  yarn: MINIMUM_YARN_OIDC_VERSION,
}

/**
 * Verify OIDC trusted publishing for release plans before anything is
 * published.
 *
 * Exchanges the OIDC identity token for a short-lived registry token per
 * package against the public npm registry's trusted-publishing endpoint and
 * discards the exchanged token: the check only confirms that the registry
 * would issue one, while the publish itself authenticates through the
 * package manager's own OIDC support. Runs when OIDC environment tokens
 * exist — even alongside an `NPM_TOKEN`, which the OIDC authentication
 * takes precedence over — and the package manager publishes with OIDC:
 * npm, pnpm, or Yarn Berry 4.3.0 or newer on a supported CI platform,
 * 4.4.2 or newer on CircleCI. Complete plans targeting the public npm registry are verified, Yarn
 * Berry plans on the registry's alias domain included, except Yarn Berry
 * plans with configured registry credentials, which publish with those
 * instead. Complete plans on any other registry fail the release when
 * neither an `NPM_TOKEN` nor ambient registry credentials exist for them,
 * because OIDC authentication cannot publish them. Requires a package
 * manager CLI that can publish with OIDC itself and fails the release
 * when it is too old. Identity token and exchange requests abort after
 * 30 seconds. A rejected exchange fails the release — Yarn Berry plans
 * publish with OIDC alone — unless npm or pnpm releases can fall back to
 * an `NPM_TOKEN` or ambient registry credentials, which are warned about
 * instead. Fails before a single package is published.
 *
 * @param context Release context containing environment and working directory
 * @param plans Release plans to verify
 * @param packageManager Information about the active package manager
 * @param pluginName Name of the plugin whose plans are verified, defaulting
 * to the npm plugin
 * @returns The plans whose trusted publishing was verified; empty when OIDC
 * authentication is not in use
 * @throws If a plan targets a registry without OIDC support and no other
 * credentials exist, or any plan's trusted-publishing token exchange was
 * rejected without credentials to fall back to
 */
export async function verifyTrustedPublishing(
  context: ReleaseContext,
  plans: readonly ReleasePlan[],
  packageManager: PackageManagerInfo,
  pluginName: string = PLUGIN_NAME
): Promise<Set<CompleteReleasePlan>> {
  if (!hasOIDCAuth(context.env)) {
    return new Set()
  }

  const yarnBerryOidc = usesYarnOidcTrustedPublishing(
    packageManager,
    context.env
  )

  if (!packageManager.isNpm && !packageManager.isPnpm && !yarnBerryOidc) {
    context.logger.debug(
      'Trusted publishing was not verified: the package manager does not support OIDC authentication.'
    )

    return new Set()
  }

  const targets: CompleteReleasePlan[] = []

  const unsupportedRegistryPlans: Array<{
    plan: CompleteReleasePlan
    registry: string
  }> = []

  for (const plan of plans) {
    if (!isCompleteReleasePlan(plan, pluginName)) {
      continue
    }

    const registry = await resolvePublishRegistry(
      context,
      plan.package,
      packageManager
    )

    const normalizedRegistry = normalizeRegistry(registry)

    const isPublicNpmRegistry =
      normalizedRegistry === DEFAULT_REGISTRY ||
      (yarnBerryOidc && normalizedRegistry === DEFAULT_YARN_REGISTRY)

    if (!isPublicNpmRegistry) {
      unsupportedRegistryPlans.push({ plan, registry })

      continue
    }

    if (
      packageManager.isYarnBerry &&
      (await hasConfiguredAuth(context, plan.package, packageManager))
    ) {
      context.logger.debug(
        `Trusted publishing was not verified for "${plan.package.name}@${plan.release.version}": configured registry credentials take precedence over OIDC with Yarn Berry.`
      )

      continue
    }

    targets.push(plan)
  }

  const unauthenticated: string[] = []

  for (const { plan, registry } of unsupportedRegistryPlans) {
    const hasCredentials =
      Boolean(context.env.NPM_TOKEN?.trim()) ||
      (await hasAuth(context, plan.package, packageManager))

    if (!hasCredentials) {
      unauthenticated.push(
        `"${plan.package.name}@${plan.release.version}" (${registry})`
      )
    }
  }

  if (unauthenticated.length > 0) {
    throw new Error(
      `OIDC trusted publishing cannot authenticate ${unauthenticated.join(
        ', '
      )}: it only supports the public npm registry and neither NPM_TOKEN nor ambient registry credentials were found.`
    )
  }

  if (targets.length === 0) {
    context.logger.debug(
      'Trusted publishing was not verified: no package targets the public npm registry.'
    )

    return new Set()
  }

  await assertOidcCapablePackageManager(context, packageManager)

  const identityToken = await resolveIdentityToken(context)

  const failures: Array<{ plan: CompleteReleasePlan; reason: string }> = []

  for (const plan of targets) {
    try {
      await exchangeTrustedPublishingToken(
        context,
        identityToken,
        plan.package.name
      )
    } catch (error) {
      failures.push({ plan, reason: String(formatError(error)) })
    }
  }

  const failedPlans = new Set(failures.map((failure) => failure.plan))

  const verified = targets.filter((plan) => !failedPlans.has(plan))

  if (failures.length > 0) {
    const fallbacks: string[] = []

    const fatal: string[] = []

    for (const { plan, reason } of failures) {
      const target = `"${plan.package.name}@${plan.release.version}" (${reason})`

      const canFallBackToCredentials =
        !packageManager.isYarnBerry &&
        (Boolean(context.env.NPM_TOKEN?.trim()) ||
          (await hasConfiguredAuth(context, plan.package, packageManager)))

      if (canFallBackToCredentials) {
        fallbacks.push(target)
      } else {
        fatal.push(target)
      }
    }

    if (fallbacks.length > 0) {
      context.logger.warn(
        colors.yellow(
          `Trusted publishing could not be verified for ${fallbacks.join(', ')}: the release will publish with NPM_TOKEN or ambient registry credentials instead.`
        )
      )
    }

    if (fatal.length > 0) {
      throw new Error(
        `Trusted publishing could not be verified for ${fatal.join(', ')}.`
      )
    }
  }

  if (verified.length > 0) {
    context.logger.info(
      `Trusted publishing verified for ${verified
        .map((plan) => `"${plan.package.name}@${plan.release.version}"`)
        .join(', ')}.`
    )
  }

  return new Set(verified)
}

/**
 * Assert that the active package manager CLI can publish with OIDC trusted
 * publishing.
 *
 * Reads the CLI version from the inspected package manager, querying it
 * when the inspection could not resolve one, and fails the release when
 * the version is unknown or older than the first version with OIDC
 * publishing support.
 *
 * @param context Release context containing environment and working directory
 * @param packageManager Information about the active package manager
 * @returns A promise that resolves when the CLI can publish with OIDC
 * trusted publishing
 * @throws If the CLI version is unknown or older than the first version
 * with OIDC publishing support
 */
export async function assertOidcCapablePackageManager(
  context: ReleaseContext,
  packageManager: PackageManagerInfo
): Promise<void> {
  const minimumVersion = MINIMUM_OIDC_CLI_VERSIONS[packageManager.name]

  if (minimumVersion === undefined) {
    return
  }

  const version =
    packageManager.version ??
    (await getPackageManagerFullVersion(context.cwd, packageManager.name, {
      env: context.env,
      signal: context.signal,
    }))

  if (version === undefined || semver.lt(version, minimumVersion)) {
    throw new Error(
      `Trusted publishing requires ${packageManager.name} >= ${minimumVersion}, but "${version ?? 'an unknown version'}" was found.`
    )
  }
}

/**
 * Build the abort signal for a trusted-publishing network request.
 *
 * Aborts when the release is aborted or the request outlives the
 * trusted-publishing request timeout, so a stalled CI endpoint cannot hang
 * the release.
 *
 * @param context Release context containing environment and working directory
 * @returns The combined abort signal
 */
function requestSignal(context: ReleaseContext): AbortSignal {
  return context.signal
    ? AbortSignal.any([context.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)])
    : AbortSignal.timeout(REQUEST_TIMEOUT_MS)
}

/**
 * Resolve the OIDC identity token for the trusted-publishing audience.
 *
 * Returns a pre-issued `NPM_ID_TOKEN` when configured and otherwise requests
 * a fresh identity token from the GitHub Actions endpoint, scoped to the
 * public npm registry's trusted-publishing audience. The request aborts
 * after the trusted-publishing request timeout.
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

  const requestUrl = context.env.ACTIONS_ID_TOKEN_REQUEST_URL?.trim()

  const requestToken = context.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN?.trim()

  if (!requestUrl || !requestToken) {
    throw new Error('OIDC identity token is not available.')
  }

  let response: Response

  try {
    const url = new URL(requestUrl)

    url.searchParams.set('audience', TRUSTED_PUBLISHING_AUDIENCE)

    response = await fetch(url, {
      headers: { authorization: `Bearer ${requestToken}` },
      signal: requestSignal(context),
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
 * The request aborts after the trusted-publishing request timeout.
 *
 * @param context Release context containing environment and working directory
 * @param identityToken The OIDC identity token to exchange
 * @param packageName The name of the package being verified
 * @returns A promise that resolves when the registry accepts the token
 * exchange
 * @throws If the registry rejected the token exchange
 */
async function exchangeTrustedPublishingToken(
  context: ReleaseContext,
  identityToken: string,
  packageName: string
): Promise<void> {
  const endpoint = `${DEFAULT_REGISTRY}-/npm/v1/oidc/token/exchange/package/${encodeURIComponent(packageName)}`

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { authorization: `Bearer ${identityToken}` },
    signal: requestSignal(context),
  })

  if (response.ok) {
    return
  }

  const body: unknown = await response.json().catch(() => undefined)

  const detail =
    isJsonObject(body) && typeof body.message === 'string' && body.message
      ? `: ${body.message}`
      : ''

  throw new Error(`HTTP ${response.status}${detail}`)
}
