// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { Package, ReleaseContext } from '@reelout/core'
import { colors } from 'consola/utils'
import { getAuthTokenKey } from './getAuthTokenKey'
import { hasAuth } from './hasAuth'
import type { PackageManagerInfo } from './inspectPackageManager'
import { loadYarnConfig } from './loadYarnConfig'
import {
  getRegistryCredentialAliases,
  normalizeRegistry,
} from './normalizeRegistry'
import {
  DEFAULT_YARN_REGISTRY,
  resolvePublishRegistry,
} from './resolvePublishRegistry'

export interface Env extends Readonly<NodeJS.ProcessEnv>, AsyncDisposable {}

/**
 * Registries whose token injection warning was already logged, so a
 * multi-package release warns once per registry instead of once per
 * package.
 */
const warnedTokenRegistries = new Set<string>()

/**
 * Configure target registry authentication tokens in the runtime environment.
 *
 * Verifies authentication state and applies environment overrides: Yarn
 * Berry receives `YARN_NPM_AUTH_TOKEN` when its publish registry matches
 * Yarn's default registry — Yarn Berry applies the token to every registry
 * without its own credentials, so other registries are skipped with a
 * warning — Yarn Classic receives `NPM_AUTH_TOKEN` for its publish command
 * and `npm_config_<authTokenKey>` for npm CLI commands, pnpm receives
 * `pnpm_config_<authTokenKey>`, and npm receives
 * `npm_config_<authTokenKey>`. Returns an async disposable environment
 * object carrying the credential overrides; nothing is persisted, so
 * disposal is a no-op.
 *
 * @param context Release context containing environment and working directory
 * @param pkg Target package metadata object
 * @param packageManager Information about the active package manager
 * @returns Disposable environment object or undefined when skipping auth
 */
export async function prepareAuth(
  context: ReleaseContext,
  pkg: Pick<Package, 'location' | 'name'>,
  packageManager: Partial<PackageManagerInfo>
): Promise<Env | undefined> {
  const token = context.env.NPM_TOKEN?.trim()

  if (!token) return

  if (await hasAuth(context, pkg, packageManager)) return

  const registry = await resolvePublishRegistry(context, pkg, packageManager)

  if (packageManager.isYarnBerry) {
    const configuration = await loadYarnConfig(context.cwd)

    const defaultRegistry =
      normalizeRegistry(configuration.get('npmPublishRegistry')) ??
      normalizeRegistry(configuration.get('npmRegistryServer')) ??
      DEFAULT_YARN_REGISTRY

    if (!getRegistryCredentialAliases(defaultRegistry).includes(registry)) {
      if (!warnedTokenRegistries.has(registry)) {
        warnedTokenRegistries.add(registry)

        context.logger.warn(
          colors.yellow(
            `NPM_TOKEN was not injected for "${registry}": Yarn Berry would apply it to every registry without its own credentials.`
          )
        )
      }

      return
    }

    return hideSymbols<Env>({
      YARN_NPM_AUTH_TOKEN: token,
      async [Symbol.asyncDispose]() {},
    })
  }

  if (packageManager.isYarnClassic) {
    return hideSymbols<Env>({
      NPM_AUTH_TOKEN: token,
      [`npm_config_${getAuthTokenKey(registry)}`]: token,
      async [Symbol.asyncDispose]() {},
    })
  }

  if (packageManager.isPnpm) {
    return hideSymbols<Env>({
      [`pnpm_config_${getAuthTokenKey(registry)}`]: token,
      async [Symbol.asyncDispose]() {},
    })
  }

  return hideSymbols<Env>({
    [`npm_config_${getAuthTokenKey(registry)}`]: token,
    async [Symbol.asyncDispose]() {},
  })
}

/**
 * Hide symbol-keyed properties, such as `Symbol.asyncDispose`, from
 * enumeration so spreading the environment object into a child process
 * environment drops them.
 */
function hideSymbols<T extends object>(object: T): T {
  for (const key of Reflect.ownKeys(object)) {
    if (typeof key === 'symbol') {
      Object.defineProperty(object, key, {
        configurable: true,
        enumerable: false,
        writable: true,
      })
    }
  }

  return object
}
