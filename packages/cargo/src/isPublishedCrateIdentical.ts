// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { ReleaseContext } from '@reelout/core'
import { formatError } from '@reelout/core'
import { createHash } from 'node:crypto'
import type { CompleteCargoReleasePlan } from './isCompleteReleasePlan'
import { packLocalCrate } from './packLocalCrate'

/**
 * Determine whether a published crate version carries the same content as
 * the local crate.
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
