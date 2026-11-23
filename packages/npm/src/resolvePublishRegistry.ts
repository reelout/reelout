// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { Package, ReleaseContext } from '@reelout/core'
import path from 'node:path'
import { extractPackageScope } from './extractPackageScope'
import type { PackageManagerInfo } from './inspectPackageManager'
import { loadConfig } from './loadConfig'
import { normalizeRegistry } from './normalizeRegistry'
import { readPackageJson } from './readPackageJson'

export const DEFAULT_REGISTRY = 'https://registry.npmjs.org/'

/**
 * Resolve the publish registry URL for a package.
 *
 * Inspects `package.json` settings, scoped overrides, and package manager files
 * to determine the target endpoint. Falls back to the default npm registry
 * when no explicit configuration exists.
 *
 * @param context Release context containing environment and working directory
 * @param pkg Target package metadata object
 * @param packageManager Information about the active package manager
 * @returns Resolved publish registry URL string
 */
export async function resolvePublishRegistry(
  context: ReleaseContext,
  pkg: Package,
  packageManager: Partial<PackageManagerInfo>
): Promise<string> {
  const packageDir = path.resolve(context.cwd, pkg.location)

  const packageScope = extractPackageScope(pkg.name)

  try {
    const packageJson = await readPackageJson(packageDir)

    const registry = normalizeRegistry(packageJson.publishConfig?.registry)

    if (registry) {
      return registry
    }
  } catch {}

  try {
    const config = await loadConfig(context.cwd, { env: context.env })

    if (packageScope) {
      const registry = normalizeRegistry(
        config.get(`@${packageScope}:registry`) as string
      )

      if (registry) {
        return registry
      }
    }

    const registry = normalizeRegistry(config.get('registry') as string)

    if (registry) {
      return registry
    }
  } catch {}

  return DEFAULT_REGISTRY
}
