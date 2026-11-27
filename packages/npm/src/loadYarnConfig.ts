// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { Configuration } from '@yarnpkg/core'
import { npath } from '@yarnpkg/fslib'
import NpmPlugin from '@yarnpkg/plugin-npm'

/**
 * Load Yarn configuration settings for a given directory.
 *
 * Resolves configuration files by converting the working directory path into a
 * portable format and initializing the Yarn Configuration with the npm plugin.
 *
 * @param cwd Working directory path to search for configuration files
 * @returns Resolved Yarn configuration instance
 */
export function loadYarnConfig(cwd: string) {
  return Configuration.find(npath.toPortablePath(cwd), {
    modules: new Map([[`@yarnpkg/plugin-npm`, NpmPlugin]]),
    plugins: new Set([`@yarnpkg/plugin-npm`]),
  })
}

/**
 * Minimal shape shared by Yarn Berry scope, registry, and top-level
 * configuration sections.
 *
 * The npm plugin hands these back as opaque `MapLike` values, so only key
 * lookup can be assumed and consumers must narrow what a lookup returns.
 */
export interface YarnConfigurationSection {
  get(key: string): unknown
}
