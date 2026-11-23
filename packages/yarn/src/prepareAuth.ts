// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { Package, ReleaseContext } from '@reelout/core'
import { getAuthTokenKey } from '@reelout/npm/getAuthTokenKey'
import type { PackageManagerInfo } from '@reelout/npm/inspectPackageManager'
import { hasAuth } from './hasAuth'
import { resolvePublishRegistry } from './resolvePublishRegistry'

export interface Env extends Readonly<NodeJS.ProcessEnv>, AsyncDisposable {}

/**
 * Configure target registry authentication tokens in the runtime environment.
 *
 * Verifies authentication state and applies environment overrides. Returns an
 * async disposable environment object that cleans up temporary credentials
 * upon disposal.
 *
 * @param context Release context containing environment and working directory
 * @param pkg Target package metadata object
 * @param packageManager Information about the active package manager
 * @returns Disposable environment object or undefined when skipping auth
 */
export async function prepareAuth(
  context: ReleaseContext,
  pkg: Package,
  packageManager: Partial<PackageManagerInfo>
): Promise<Env | undefined> {
  const token = context.env.NPM_TOKEN

  if (!token) return

  if (await hasAuth(context, pkg, packageManager)) return

  const registry = await resolvePublishRegistry(context, pkg, packageManager)

  if (packageManager.isYarnBerry) {
    return conceal<Env>({
      YARN_NPM_AUTH_TOKEN: token,
      async [Symbol.asyncDispose]() {},
    })
  }

  return conceal<Env>({
    [`npm_config_${getAuthTokenKey(registry)}`]: token,
    async [Symbol.asyncDispose]() {},
  })
}

function conceal<T extends object>(object: T): T {
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
