// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { DEFAULT_CHANGELOG_FILE } from '#config'
import type { ReleasePlan } from '#types'
import type { ConsolaInstance } from 'consola/core'
import path from 'node:path'
import { prependChangelog } from './prependChangelog'

/**
 * Write changelog content to the file system based on the release plan.
 *
 * @param cwd Repository working directory
 * @param plan Release plan containing package and changelog content
 * @param logger Optional logger that receives formatting failures
 * @returns Promise that resolves when the changelog file has been written
 */
export async function writeChangelog(
  cwd: string,
  plan: ReleasePlan,
  logger?: ConsolaInstance
): Promise<void> {
  if (plan.release?.changelog) {
    const changelogFile = plan.package.changelogFile || DEFAULT_CHANGELOG_FILE

    const filePath = path.join(cwd, plan.package.location, changelogFile)

    await prependChangelog(filePath, plan.release.changelog, logger)
  }
}
