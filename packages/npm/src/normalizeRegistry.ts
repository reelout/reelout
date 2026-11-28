// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

/** Host of the public npm registry. */
const NPM_REGISTRY_HOST = 'registry.npmjs.org'

/** Host of the public npm registry's pure alias domain. */
const YARN_REGISTRY_HOST = 'registry.yarnpkg.com'

/**
 * Normalize a registry URL string.
 *
 * Validates the input string using the `URL` constructor, strips any
 * username and password — embedded credentials never contribute to the
 * registry's configuration keys — and extracts its href representation.
 * Returns undefined if the string is empty or invalid.
 *
 * @param registry Registry URL string to normalize
 * @returns Normalized URL string or undefined if invalid
 */
export function normalizeRegistry(
  registry: string | null | undefined
): string | undefined {
  if (!registry) return undefined

  try {
    const url = new URL(registry)

    url.password = ''
    url.username = ''

    return url.href
  } catch {
    return undefined
  }
}

/**
 * List the registry URLs whose credentials are shared with a registry.
 *
 * `registry.yarnpkg.com` is a pure alias domain of `registry.npmjs.org`,
 * so credentials configured for one host are also looked up for the
 * other, in both directions. Every other registry shares credentials
 * only with itself. The order prefers the given registry over its alias.
 *
 * @param registry Registry URL string to expand
 * @returns The registry and its credential-sharing alias, when one exists
 */
export function getRegistryCredentialAliases(registry: string): string[] {
  let url: URL

  try {
    url = new URL(registry)
  } catch {
    return [registry]
  }

  const aliasHost =
    url.hostname === YARN_REGISTRY_HOST
      ? NPM_REGISTRY_HOST
      : url.hostname === NPM_REGISTRY_HOST
        ? YARN_REGISTRY_HOST
        : undefined

  if (aliasHost === undefined) {
    return [registry]
  }

  url.hostname = aliasHost

  return [registry, url.href]
}
