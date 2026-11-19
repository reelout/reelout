// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { isSemVerGitTag } from '#config'
import { packageTagPrefix } from './packageTagPrefix'

/**
 * Test whether a tag name follows the naming convention of a package.
 *
 * Entry packages use `v`-prefixed version tags, workspace packages use
 * `<name>@`-prefixed version tags, mirroring {@link generateGitTagName}.
 * The version portion must satisfy the repository's SemVer tag rules.
 *
 * @remarks
 * Entry tags additionally exclude `@`: `isSemVerGitTag` also accepts
 * `<name>@<version>` tags whose name starts with `v` (for example
 * `vfoo@1.0.0`), which must not match the entry convention.
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
    return tag.startsWith(packageTagPrefix(true, name)) && !tag.includes('@')
  }

  return name ? tag.startsWith(packageTagPrefix(false, name)) : false
}
