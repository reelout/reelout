// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { Package, ReleaseContext } from '@reelout/core'
import { formatError } from '@reelout/core'
import path from 'node:path'
import { extractPackageScope } from './extractPackageScope'
import type { PackageManagerInfo } from './inspectPackageManager'
import { loadConfig } from './loadConfig'
import { loadYarnConfig } from './loadYarnConfig'
import { normalizeRegistry } from './normalizeRegistry'
import { readPackageJson } from './readPackageJson'

export const DEFAULT_REGISTRY = 'https://registry.npmjs.org/'

export const DEFAULT_YARN_REGISTRY = 'https://registry.yarnpkg.com/'

/**
 * Resolve the publish registry URL for a package.
 *
 * Inspects `package.json` settings, scoped overrides, and package manager files
 * to determine the target endpoint. Falls back to default npm or Yarn registries
 * when no explicit configuration exists. Configuration files that fail to load
 * fail the resolution, because silently falling back to a default registry
 * could publish a package to a registry it was never configured for.
 *
 * @param context Release context containing environment and working directory
 * @param pkg Target package metadata object
 * @param packageManager Information about the active package manager
 * @returns Resolved publish registry URL string
 * @throws If the package manifest or the active package manager's
 * configuration could not be read
 */
export async function resolvePublishRegistry(
  context: ReleaseContext,
  pkg: Pick<Package, 'location' | 'name'>,
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
  } catch (error) {
    const cause = (error as { cause?: unknown }).cause

    if ((cause as NodeJS.ErrnoException | undefined)?.code !== 'ENOENT') {
      throw new Error(
        'The package manifest could not be read while resolving the publish registry.',
        { cause: error }
      )
    }

    context.logger.debug(
      `Package manifest could not be read while resolving the publish registry: ${formatError(error)}`
    )
  }

  if (packageManager.isYarnBerry) {
    const config = await loadYarnConfigOrFail(context)

    if (packageScope) {
      const scopeSettings = config.get('npmScopes').get(packageScope)

      const registry =
        normalizeRegistry(scopeSettings?.get('npmPublishRegistry')) ??
        normalizeRegistry(scopeSettings?.get('npmRegistryServer'))

      if (registry) {
        return registry
      }
    }

    const registry =
      normalizeRegistry(config.get('npmPublishRegistry')) ??
      normalizeRegistry(config.get('npmRegistryServer'))

    if (registry) {
      return registry
    }

    return DEFAULT_YARN_REGISTRY
  }

  const config = await loadConfigOrFail(context)

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

  return DEFAULT_REGISTRY
}

/**
 * Load Yarn configuration settings or fail with a contextual error.
 *
 * @param context Release context containing environment and working directory
 * @returns Resolved Yarn configuration instance
 * @throws If the Yarn configuration could not be loaded
 */
async function loadYarnConfigOrFail(context: ReleaseContext) {
  try {
    return await loadYarnConfig(context.cwd)
  } catch (error) {
    throw new Error(
      'The Yarn configuration could not be loaded while resolving the publish registry.',
      { cause: error }
    )
  }
}

/**
 * Load npm configuration settings or fail with a contextual error.
 *
 * @param context Release context containing environment and working directory
 * @returns Resolved npm configuration instance
 * @throws If the npm configuration could not be loaded
 */
async function loadConfigOrFail(context: ReleaseContext) {
  try {
    return await loadConfig(context.cwd, { env: context.env })
  } catch (error) {
    throw new Error(
      'The npm configuration could not be loaded while resolving the publish registry.',
      { cause: error }
    )
  }
}
