// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { ReleaseContext, ReleasePlan } from '@reelout/core'
import { formatError } from '@reelout/core'
import {
  comparePackageTarballs,
  type PackageTarballVerdict,
} from './comparePackageTarballs'
import { downloadPublishedTarball } from './downloadPublishedTarball'
import type { PackageManagerInfo } from './inspectPackageManager'
import { packLocalTarball } from './packLocalTarball'

/**
 * Prove whether a published package version carries the same content as the
 * local package.
 *
 * Downloads the published tarball, packs the local package with the active
 * package manager, and compares both tarballs by logical content. Failures to
 * obtain either tarball are reported as an `undeterminable` verdict with the
 * reason, so a broken download or pack never passes as identical content.
 *
 * @param context Release context containing environment and working directory
 * @param plan Release plan describing the package to verify
 * @param packageManager Information about the active package manager
 * @param tarballUrl URL of the published tarball, when the manifest has one
 * @returns The comparison verdict for the published and local tarballs
 */
export async function proveSamePublication(
  context: ReleaseContext,
  plan: ReleasePlan,
  packageManager: PackageManagerInfo,
  tarballUrl: string | undefined
): Promise<PackageTarballVerdict> {
  if (!tarballUrl) {
    return {
      verdict: 'undeterminable',
      reason: 'the published manifest does not include a tarball URL',
    }
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
    return {
      verdict: 'undeterminable',
      reason: `the published tarball could not be downloaded: ${formatError(error)}`,
    }
  }

  let localTarball: Buffer

  try {
    localTarball = await packLocalTarball(context, plan, packageManager)
  } catch (error) {
    return {
      verdict: 'undeterminable',
      reason: `the local tarball could not be packed: ${formatError(error)}`,
    }
  }

  return comparePackageTarballs(publishedTarball, localTarball)
}
