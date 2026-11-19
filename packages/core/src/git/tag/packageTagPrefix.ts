// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

/**
 * Build the tag name prefix shared by a package's git tags.
 *
 * Entry packages use the `v` prefix, workspace packages use `<name>@`.
 *
 * @param entry Whether the package is the repository entry package
 * @param name Package name (required for non-entry packages)
 * @returns Tag name prefix
 * @throws If a non-entry package has no name
 */
export function packageTagPrefix(
  entry: boolean,
  name: string | null | undefined
): string {
  if (entry) {
    return 'v'
  }

  if (!name) {
    throw new Error('Package name is required to build a tag name.')
  }

  return `${name}@`
}
