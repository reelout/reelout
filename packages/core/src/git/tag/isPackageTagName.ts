// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { isSemVerGitTag } from '#config'

/**
 * Test whether a tag name follows the naming convention of a package.
 *
 * Entry packages use `v`-prefixed version tags, workspace packages use
 * `<name>@`-prefixed version tags, mirroring {@link generateGitTagName}.
 * The version portion must satisfy the repository's SemVer tag rules.
 *
 * @param entry Whether the package is the repository entry package
 * @param name Package name (used for non-entry packages)
 * @param tag Tag name to test
 * @returns `true` if the tag follows the package's naming convention
 */
export function isPackageTagName(
  entry: boolean,
  name: string | null | undefined,
  tag: string
): boolean {
  if (!isSemVerGitTag(tag)) {
    return false
  }

  if (entry) {
    return tag.startsWith('v') && !tag.includes('@')
  }

  return name ? tag.startsWith(`${name}@`) : false
}
