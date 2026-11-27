// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { ReleaseConfig, ResolvedReleaseConfig } from '@reelout/core'
import { cosmiconfig } from 'cosmiconfig'
import { defaultConfig } from './defaultConfig'
import { mergeConfig } from './mergeConfig'
import { normalizeConfig } from './normalizeConfig'
import { validateUserConfig } from './validateUserConfig'

/**
 * Resolve and normalize a release configuration for a target directory.
 *
 * Searches for configuration files using `cosmiconfig`, validates the raw
 * shape of the discovered settings, merges them with default configurations,
 * and normalizes the resulting structure.
 *
 * @param cwd Working directory path to search from
 * @param name Module name used for configuration file discovery
 * @returns Resolved and normalized release configuration
 * @throws If a discovered configuration value has an invalid shape, or a
 * configured plugin cannot be resolved
 */
export async function resolveConfig(
  cwd: string,
  name = 'reelout'
): Promise<ResolvedReleaseConfig> {
  const explorer = cosmiconfig(name)

  const result = await explorer.search(cwd)

  if (result?.config !== undefined) {
    validateUserConfig(result.config, result.filepath)
  }

  const config = mergeConfig<Required<ReleaseConfig>>(
    defaultConfig,
    result?.config
  )

  return normalizeConfig(cwd, config)
}
