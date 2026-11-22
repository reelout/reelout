// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { GitRepository } from '@reelout/core'
import GitHost from 'hosted-git-info'
import { readCargoToml } from './readCargoToml'

/**
 * Resolve Git repository metadata from the root Cargo manifest.
 *
 * Reads `[package].repository` in the root `Cargo.toml` and parses it with
 * `hosted-git-info` to identify the host type, owner, repository, and URL.
 *
 * @param cwd Directory containing the root Cargo manifest
 * @returns Git repository details or null if missing or unresolvable
 */
export async function resolveCargoRepository(
  cwd: string
): Promise<GitRepository | null> {
  try {
    const manifest = await readCargoToml(cwd)

    const repository = manifest.package?.repository

    if (typeof repository !== 'string') {
      return null
    }

    const info = GitHost.fromUrl(repository)

    if (
      info &&
      typeof info === 'object' &&
      typeof info.type === 'string' &&
      typeof info.user === 'string' &&
      typeof info.project === 'string'
    ) {
      return {
        host: info.type,
        owner: info.user,
        repo: info.project,
        url: info.browse(),
      }
    }
  } catch {}

  return null
}
