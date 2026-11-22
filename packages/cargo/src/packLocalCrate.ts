// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { ReleaseContext } from '@reelout/core'
import { execCommand } from '@reelout/core'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { CompleteReleasePlan } from './isCompleteReleasePlan'

/**
 * Pack a plan's crate into a `.crate` file with `cargo package`.
 *
 * Runs `cargo package --no-verify --allow-dirty` against a temporary
 * target directory and returns the single produced `.crate` file, so the
 * local content can be compared against a published crate's checksum. The
 * verification build is skipped because publishing builds the crate
 * anyway, and dirty working trees are allowed because the pack is a local
 * diagnostic that never uploads anything.
 *
 * @param context Release context containing environment and working
 * directory
 * @param plan Release plan describing the crate to pack
 * @returns The packed crate bytes
 * @throws If the pack command fails or does not produce exactly one crate
 */
export async function packLocalCrate(
  context: ReleaseContext,
  plan: CompleteReleasePlan
): Promise<Buffer> {
  const packDir = await mkdtemp(path.join(tmpdir(), 'reelout-crate-'))

  try {
    await execCommand(
      'cargo',
      [
        'package',
        '--no-verify',
        '--allow-dirty',
        '-p',
        plan.package.name,
        '--target-dir',
        packDir,
      ],
      {
        cwd: context.cwd,
        env: { ...context.env },
        signal: context.signal,
      }
    )

    const packageDir = path.join(packDir, 'package')

    const crates = (await readdir(packageDir)).filter((entry) =>
      entry.endsWith('.crate')
    )

    const [crateName] = crates

    if (crateName === undefined || crates.length !== 1) {
      throw new Error(
        `A single packed crate was expected in "${packageDir}", found ${crates.length}.`
      )
    }

    return await readFile(path.join(packageDir, crateName))
  } finally {
    await rm(packDir, { recursive: true, force: true })
  }
}
