// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { ReleaseContext, ReleasePlan } from '@reelout/core'
import { formatError } from '@reelout/core'
import type { PackageManagerInfo } from './inspectPackageManager'
import { isPackageTarballIdentical } from './isPackageTarballIdentical'
import { isTarballIntegrityMatch } from './isTarballIntegrityMatch'
import { downloadPublishedTarball } from './downloadPublishedTarball'
import { packLocalTarball } from './packLocalTarball'

/**
 * Prove whether a published package version carries the same content as the
 * local package.
 *
 * Packs the local package with the active package manager and proves the
 * publication without any download when its tarball hash matches the
 * registry-recorded integrity value. Otherwise downloads the published
 * tarball and compares both tarballs by logical content. Failures to obtain
 * either tarball are logged and reported as `false`, so a broken download
 * or pack never passes as identical content.
 *
 * @param context Release context containing environment and working directory
 * @param plan Release plan describing the package to verify
 * @param packageManager Information about the active package manager
 * @param tarballUrl URL of the published tarball, when the manifest has one
 * @param integrity Registry-recorded integrity value of the published
 * tarball, when the manifest has one
 * @returns True when the published tarball carries the same logical content
 * as the locally packed tarball
 */
export async function proveSamePublication(
  context: ReleaseContext,
  plan: ReleasePlan,
  packageManager: PackageManagerInfo,
  tarballUrl: string | undefined,
  integrity: string | undefined
): Promise<boolean> {
  let localTarball: Buffer

  try {
    localTarball = await packLocalTarball(context, plan, packageManager)
  } catch (error) {
    context.logger.debug(
      `The local tarball could not be packed, so the publication cannot be verified: ${formatError(error)}`
    )

    return false
  }

  if (
    integrity !== undefined &&
    isTarballIntegrityMatch(localTarball, integrity)
  ) {
    context.logger.debug(
      'The locally packed tarball matches the published integrity value, so the publication is verified without downloading the tarball.'
    )

    return true
  }

  if (!tarballUrl) {
    context.logger.debug(
      'The published manifest does not include a tarball URL, so the publication cannot be verified.'
    )

    return false
  }

  let publishedTarball: Buffer

  try {
    publishedTarball = await downloadPublishedTarball(
      context,
      plan,
      packageManager,
      tarballUrl
    )
  } catch (error) {
    context.logger.debug(
      `The published tarball could not be downloaded, so the publication cannot be verified: ${formatError(error)}`
    )

    return false
  }

  return isPackageTarballIdentical(publishedTarball, localTarball)
}
