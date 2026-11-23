// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { ReleaseContext, ReleasePlan } from '@reelout/core'
import { execCommand } from '@reelout/core'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { PackageManagerInfo } from './inspectPackageManager'

/**
 * Pack a plan's package into a tarball with the active package manager.
 *
 * Runs the package manager's `pack` command in the plan's package directory
 * against a temporary destination and returns the single produced tarball,
 * so the local content can be compared against a published tarball.
 *
 * @param context Release context containing environment and working directory
 * @param plan Release plan describing the package to pack
 * @param packageManager Information about the active package manager
 * @returns The packed tarball bytes
 * @throws If the pack command fails or does not produce exactly one tarball
 */
export async function packLocalTarball(
  context: ReleaseContext,
  plan: ReleasePlan,
  packageManager: PackageManagerInfo
): Promise<Buffer> {
  const packageDir = path.resolve(context.cwd, plan.package.location)

  const packDir = await mkdtemp(path.join(tmpdir(), 'reelout-pack-'))

  try {
    const commandArgs: string[] = ['pack', '--pack-destination', packDir]

    await execCommand(packageManager.name, commandArgs, {
      cwd: packageDir,
      env: { ...context.env },
      signal: context.signal,
    })

    const tarballs = (await readdir(packDir)).filter((entry) =>
      entry.endsWith('.tgz')
    )

    const [tarballName] = tarballs

    if (tarballName === undefined || tarballs.length !== 1) {
      throw new Error(
        `A single packed tarball was expected in "${packDir}", found ${tarballs.length}.`
      )
    }

    return await readFile(path.join(packDir, tarballName))
  } finally {
    await rm(packDir, { recursive: true, force: true })
  }
}
