// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { ReleaseContext } from '@reelout/core'
import { formatError } from '@reelout/core'
import { colors } from 'consola/utils'
import type { CompleteCargoReleasePlan } from './isCompleteReleasePlan'
import type { SparseIndexClient, SparseIndexResult } from './sparseIndex'
import type { PublishAccessVerdict } from './types'
import { CARGO_REGISTRY_API, USER_AGENT } from './verifyAuth'

/** Inputs for the crates.io publish-access check. */
export interface VerifyPublishAccessOptions {
  token: string
  login: string
  index: SparseIndexClient
}

/** One owner entry of a crate, as reported by the ownership endpoint. */
interface CrateOwner {
  login: string
  kind: string | undefined
}

/**
 * Verify that the authenticated registry user may publish the planned
 * crates.
 *
 * Checks each publishable plan against crates.io before anything is
 * published: new crates are allowed without a check, versions already in
 * the sparse index are left to the published-version probe, and existing
 * crates with an absent target version are checked against their owners.
 * Denied plans fail the release together, and unverifiable plans warn and
 * proceed, so a real publish surfaces any access the check could not see.
 *
 * @param context Release context containing environment, plans, and logger
 * @param plans The complete release plans to verify
 * @param options Verification inputs carrying token, login, and index
 * @returns A promise that resolves when every plan's access is verified
 * @throws If the authenticated registry user is not an owner of a planned
 * crate
 */
export async function verifyPublishAccess(
  context: ReleaseContext,
  plans: readonly CompleteCargoReleasePlan[],
  options: VerifyPublishAccessOptions
): Promise<void> {
  const denied: string[] = []

  const unknown: string[] = []

  for (const plan of plans) {
    const target = `${plan.package.name}@${plan.release.version}`

    const verdict = await resolveVerdict(context, plan, options)

    if (verdict === 'denied') {
      denied.push(target)
    } else if (verdict === 'unknown') {
      unknown.push(target)
    }
  }

  if (denied.length > 0) {
    throw new Error(
      `Crates will not be published: the authenticated registry user is not an owner of ${denied
        .map((target) => `"${target}"`)
        .join(', ')}.`
    )
  }

  for (const target of unknown) {
    context.logger.warn(
      colors.yellow(
        `Publish access could not be verified for "${target}": publishing will proceed and fail if access is missing.`
      )
    )
  }
}

/**
 * Resolve the publish-access verdict for one release plan.
 *
 * Reads the crate's sparse index records to short-circuit the ownership
 * check for new crates and already published versions, then falls back to
 * the ownership endpoint for the remaining crates.
 *
 * @param context Release context containing environment and logger
 * @param plan The complete release plan to verify
 * @param options Verification inputs carrying token, login, and index
 * @returns The publish-access verdict for the plan
 */
async function resolveVerdict(
  context: ReleaseContext,
  plan: CompleteCargoReleasePlan,
  options: VerifyPublishAccessOptions
): Promise<PublishAccessVerdict> {
  const target = `${plan.package.name}@${plan.release.version}`

  let records: SparseIndexResult

  try {
    records = await options.index.getRecords(plan.package.name)
  } catch (error) {
    context.logger.debug(
      `Publish access could not be verified for "${target}": ${formatError(error)}`
    )

    return 'unknown'
  }

  if (records.status === 'absent') {
    context.logger.debug(
      `Publish access is allowed for "${target}": the crate has not been published before.`
    )

    return 'allowed'
  }

  if (records.records.some((record) => record.vers === plan.release.version)) {
    context.logger.debug(
      `Publish access is not checked for "${target}": the version is already published.`
    )

    return 'allowed'
  }

  return await resolveOwnersVerdict(context, plan, options)
}

/**
 * Resolve the publish-access verdict from a crate's owners.
 *
 * Queries the crates.io ownership endpoint with the verified token and
 * matches the user owners against the authenticated login. Team ownership
 * cannot be resolved through the registry token, so crates owned by teams
 * report unknown instead of a verdict.
 *
 * @param context Release context containing environment and logger
 * @param plan The complete release plan to verify
 * @param options Verification inputs carrying token, login, and index
 * @returns The publish-access verdict for the plan
 */
async function resolveOwnersVerdict(
  context: ReleaseContext,
  plan: CompleteCargoReleasePlan,
  options: VerifyPublishAccessOptions
): Promise<PublishAccessVerdict> {
  const target = `${plan.package.name}@${plan.release.version}`

  let data: unknown

  try {
    const response = await fetch(
      `${CARGO_REGISTRY_API}/crates/${encodeURIComponent(plan.package.name)}/owners`,
      {
        headers: {
          Authorization: `Bearer ${options.token}`,
          'User-Agent': USER_AGENT,
        },
        ...(context.signal ? { signal: context.signal } : {}),
      }
    )

    if (!response.ok) {
      context.logger.debug(
        `Publish access could not be verified for "${target}": the ownership endpoint responded with HTTP ${response.status}.`
      )

      return 'unknown'
    }

    data = await response.json()
  } catch (error) {
    context.logger.debug(
      `Publish access could not be verified for "${target}": ${formatError(error)}`
    )

    return 'unknown'
  }

  const owners = parseCrateOwners(data)

  if (owners === undefined) {
    context.logger.debug(
      `Publish access could not be verified for "${target}": the ownership response could not be parsed.`
    )

    return 'unknown'
  }

  let teamOwned = false

  for (const owner of owners) {
    if (owner.kind === 'team') {
      teamOwned = true

      continue
    }

    if (owner.login === options.login) {
      context.logger.debug(
        `Publish access is allowed for "${target}": the authenticated registry user owns the crate.`
      )

      return 'allowed'
    }
  }

  if (teamOwned) {
    context.logger.debug(
      `Publish access could not be verified for "${target}": the crate is owned by a team.`
    )

    return 'unknown'
  }

  return 'denied'
}

/**
 * Parse the owners reported by the crates.io ownership endpoint.
 *
 * @param data The parsed ownership response body
 * @returns The crate's owners, or undefined when the body does not report
 * a usable owner list
 */
function parseCrateOwners(data: unknown): CrateOwner[] | undefined {
  const users =
    typeof data === 'object' && data !== null
      ? (data as { users?: unknown }).users
      : undefined

  if (!Array.isArray(users)) {
    return undefined
  }

  const owners: CrateOwner[] = []

  for (const user of users) {
    const login =
      typeof user === 'object' && user !== null
        ? (user as { login?: unknown }).login
        : undefined

    const kind =
      typeof user === 'object' && user !== null
        ? (user as { kind?: unknown }).kind
        : undefined

    if (typeof login !== 'string' || !login) {
      continue
    }

    owners.push({
      login,
      kind: typeof kind === 'string' ? kind : undefined,
    })
  }

  return owners.length > 0 ? owners : undefined
}
