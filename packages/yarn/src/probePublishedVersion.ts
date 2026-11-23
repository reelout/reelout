// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { ReleaseContext, ReleasePlan } from '@reelout/core'
import { execCommand, formatError } from '@reelout/core'
import path from 'node:path'
import type { PackageManagerInfo } from '@reelout/npm/inspectPackageManager'
import { isJsonObject } from '@reelout/npm/isJsonObject'
import { prepareAuth } from './prepareAuth'
import { resolvePublishRegistry } from './resolvePublishRegistry'

/**
 * The result of probing the publish registry for a plan's target package
 * version.
 *
 * - `absent`: the registry does not hold the target version.
 * - `published`: the registry holds the target version, along with its
 *   tarball URL, integrity, and dist-tags.
 */
export type PublishedVersionStatus =
  | { status: 'absent' }
  | {
      status: 'published'
      tarballUrl: string | undefined
      integrity: string | undefined
      distTags: Record<string, string>
    }

/**
 * Match a registry's response for a missing package.
 */
export const NOT_FOUND_PATTERN = /E404|Response Code: 404|Not Found - 404/i

/**
 * Probe the publish registry for a plan's target package version.
 *
 * Queries `<name>@<version>` with the package manager's metadata command in
 * the plan's package directory, using the same authentication environment a
 * publish would use. A not-found response reports the version as absent,
 * while any other command failure propagates so authentication and network
 * problems surface before anything is published. Yarn Berry reports missing
 * versions by falling back to the latest manifest, so a manifest whose
 * version differs from the target counts as absent as well.
 *
 * @param context Release context containing environment and working directory
 * @param plan Release plan whose package version is probed
 * @param packageManager Information about the active package manager
 * @returns The published version's tarball URL, integrity, and dist-tags,
 * or absent status
 * @throws If the probe command fails without reporting not found, or its
 * output cannot be parsed as registry metadata
 */
export async function probePublishedVersion(
  context: ReleaseContext,
  plan: ReleasePlan,
  packageManager: PackageManagerInfo
): Promise<PublishedVersionStatus> {
  const name = plan.package.name
  const version = plan.release?.version

  /* istanbul ignore if -- publishable plans guarantee a name and version */
  if (name == null || version == null) {
    return { status: 'absent' }
  }

  const target = `${name}@${version}`

  const packageDir = path.resolve(context.cwd, plan.package.location)

  await using env = await prepareAuth(context, plan.package, packageManager)

  let stdout: string

  try {
    if (packageManager.isYarnBerry) {
      stdout = await execCommand('yarn', ['npm', 'info', target, '--json'], {
        cwd: packageDir,
        env: { ...context.env, ...env },
        signal: context.signal,
      })
    } else {
      const registry = await resolvePublishRegistry(
        context,
        plan.package,
        packageManager
      )

      stdout = await execCommand(
        'npm',
        ['view', target, '--json', '--registry', registry],
        {
          cwd: packageDir,
          env: { ...context.env, ...env },
          signal: context.signal,
        }
      )
    }
  } catch (error) {
    if (NOT_FOUND_PATTERN.test(String(formatError(error)))) {
      return { status: 'absent' }
    }

    throw error
  }

  const metadata = parseRegistryMetadata(target, stdout)

  if (metadata.version !== version) {
    return { status: 'absent' }
  }

  return {
    status: 'published',
    tarballUrl: readTarballUrl(metadata),
    integrity: readIntegrity(metadata),
    distTags: readDistTags(metadata),
  }
}

/**
 * Parse registry metadata output into a manifest object.
 *
 * Accepts the object shapes printed by `npm view` (a one-element array for a
 * concrete version query) and `yarn npm info`, and throws so unexpected
 * output never masquerades as a published or absent version.
 *
 * @param target The package version the metadata was queried for
 * @param stdout The command output to parse
 * @returns The parsed registry manifest object
 * @throws If the output is not JSON or does not contain a manifest object
 */
function parseRegistryMetadata(
  target: string,
  stdout: string
): Record<string, unknown> {
  let metadata: unknown

  try {
    const parsed: unknown = JSON.parse(stdout)

    metadata = Array.isArray(parsed) ? parsed[0] : parsed
  } catch (error) {
    throw new Error(
      `Registry metadata for "${target}" could not be parsed: ${formatError(error)}`,
      { cause: error }
    )
  }

  if (!isJsonObject(metadata)) {
    throw new Error(
      `Registry metadata for "${target}" could not be parsed: unexpected metadata format`
    )
  }

  return metadata
}

/**
 * Read the published tarball URL from a registry manifest.
 *
 * @param metadata The parsed registry manifest object
 * @returns The tarball URL, or undefined when the manifest omits it
 */
function readTarballUrl(metadata: Record<string, unknown>): string | undefined {
  const dist = metadata.dist

  if (!isJsonObject(dist)) {
    return undefined
  }

  return typeof dist.tarball === 'string' ? dist.tarball : undefined
}

/**
 * Read the recorded integrity value from a registry manifest.
 *
 * @param metadata The parsed registry manifest object
 * @returns The integrity value, or undefined when the manifest omits it
 */
function readIntegrity(metadata: Record<string, unknown>): string | undefined {
  const dist = metadata.dist

  if (!isJsonObject(dist)) {
    return undefined
  }

  return typeof dist.integrity === 'string' ? dist.integrity : undefined
}

/**
 * Read the registry's dist-tags from a registry manifest.
 *
 * @param metadata The parsed registry manifest object
 * @returns A map of dist-tag names to version strings
 */
function readDistTags(
  metadata: Record<string, unknown>
): Record<string, string> {
  const distTags = metadata['dist-tags']

  if (!isJsonObject(distTags)) {
    return {}
  }

  const result: Record<string, string> = {}

  for (const [tag, version] of Object.entries(distTags)) {
    if (typeof version === 'string') {
      result[tag] = version
    }
  }

  return result
}
