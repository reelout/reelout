// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import {
  formatError,
  type GitRepository,
  type ReleaseContext,
} from '@reelout/core'
import GitHost from 'hosted-git-info'
import { readCargoToml } from './readCargoToml'

/**
 * Resolve Git repository metadata from the root Cargo manifest.
 *
 * Reads `[package].repository` in the root `Cargo.toml` and parses it with
 * `hosted-git-info` to identify the host type, owner, repository, and URL.
 * A manifest that cannot be read or parsed resolves to null and logs a
 * debug message.
 *
 * @param cwd Directory containing the root Cargo manifest
 * @param context Release context carrying the logger
 * @returns Git repository details or null if missing or unresolvable
 */
export async function resolveGitRepositoryFromCargoManifest(
  cwd: string,
  context: Pick<ReleaseContext, 'logger'>
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
  } catch (error) {
    context.logger.debug(
      `Cargo manifest could not be read while resolving the repository: ${formatError(error)}`
    )
  }

  return null
}
