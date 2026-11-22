// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { ReleaseContext, ReleasePlan } from '@reelout/core'
import { formatError } from '@reelout/core'
import { colors } from 'consola/utils'
import { createHash } from 'node:crypto'
import type { CompleteCargoReleasePlan } from './isCompleteReleasePlan'
import { packLocalCrate } from './packLocalCrate'
import type { SparseIndexClient } from './sparseIndex'

/** Options for probing a crate version in the sparse index. */
export interface ProbePublishedCrateOptions {
  index: SparseIndexClient

  /** Read the records again, bypassing the client's cache. */
  fresh?: boolean | undefined
}

/**
 * The result of probing the sparse index for a crate version.
 *
 * - `absent`: the registry does not hold the crate version.
 * - `published`: the registry holds the crate version, along with the
 *   checksum of its published `.crate` file.
 */
export type PublishedCrateStatus =
  { status: 'absent' } | { status: 'published'; cksum: string }

/**
 * Probe the sparse index for a crate version.
 *
 * Reads the crate's records through the shared index client and reports
 * whether the target version is published, along with its recorded
 * checksum. A fresh probe bypasses the client's cache, for recovery after
 * a publish-over conflict.
 *
 * @param name The crate name to probe
 * @param version The crate version to probe
 * @param options Probe options carrying the index client
 * @returns The published version's checksum, or absent status
 * @throws If the sparse index cannot be read
 */
export async function probePublishedCrate(
  name: string,
  version: string,
  options: ProbePublishedCrateOptions
): Promise<PublishedCrateStatus> {
  const records =
    options.fresh === true
      ? await options.index.reload(name)
      : await options.index.getRecords(name)

  if (records.status === 'absent') {
    return { status: 'absent' }
  }

  const record = records.records.find((entry) => entry.vers === version)

  if (record === undefined) {
    return { status: 'absent' }
  }

  return { status: 'published', cksum: record.cksum }
}

/**
 * Prove whether a published crate version carries the same content as the
 * local crate.
 *
 * Packs the crate locally and compares the SHA-256 checksum of the packed
 * `.crate` file with the checksum recorded in the sparse index. A pack
 * failure is logged and reported as `false`, so a broken pack never passes
 * as identical content.
 *
 * @param context Release context containing environment and working
 * directory
 * @param plan Release plan describing the crate to verify
 * @param cksum The checksum recorded in the sparse index
 * @returns True when the packed crate matches the published checksum
 */
export async function isPublishedCrateIdentical(
  context: ReleaseContext,
  plan: CompleteCargoReleasePlan,
  cksum: string
): Promise<boolean> {
  let crate: Buffer

  try {
    crate = await packLocalCrate(context, plan)
  } catch (error) {
    context.logger.debug(
      `The local crate could not be packed, so the publication cannot be verified: ${formatError(error)}`
    )

    return false
  }

  const checksum = createHash('sha256').update(crate).digest('hex')

  if (checksum === cksum) {
    return true
  }

  context.logger.debug(
    'The locally packed crate does not match the checksum recorded in the sparse index.'
  )

  return false
}

/**
 * Probe a complete release plan and mark it skipped when its version is
 * already published with identical content.
 *
 * @param context Release context containing environment, plans, and logger
 * @param plan The complete release plan to probe
 * @param index The shared sparse index client
 * @param skipped Set collecting plans whose publish is skipped
 * @returns A promise that resolves when the plan's registry version is
 * probed
 * @throws If the registry version holds content that cannot be verified as
 * identical to the local crate
 */
export async function probeCrateReleasePlan(
  context: ReleaseContext,
  plan: CompleteCargoReleasePlan,
  index: SparseIndexClient,
  skipped: Set<ReleasePlan>
): Promise<void> {
  const target = `${plan.package.name}@${plan.release.version}`

  const probe = await probePublishedCrate(
    plan.package.name,
    plan.release.version,
    { index }
  )

  if (probe.status === 'absent') {
    return
  }

  const identical = await isPublishedCrateIdentical(context, plan, probe.cksum)

  if (!identical) {
    throw new Error(
      `Version "${target}" was not published: the registry already has this version and its content could not be verified as identical.`
    )
  }

  context.logger.warn(
    colors.yellow(
      `Skipping publish of "${target}": already published with identical content.`
    )
  )

  skipped.add(plan)
}
