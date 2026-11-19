// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { SEMVER_REGEX } from '#config'

/**
 * Test whether a tag name follows the naming convention of a package.
 *
 * Entry packages use `v`-prefixed version tags, workspace packages use
 * `<name>@`-prefixed version tags, mirroring {@link generateGitTagName}.
 * The version portion must satisfy the repository's SemVer tag rules.
 *
 * @remarks
 * Anchors `SEMVER_REGEX.source` for full-string matching, like
 * {@link isSemVerGitTag}, and inspects the captured package name: entry
 * tags must carry the `v` prefix without a captured package name, so a
 * tag like `vfoo@1.0.0` (which captures `vfoo`) does not match the
 * entry convention.
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
  const match = new RegExp(`^${SEMVER_REGEX.source}$`).exec(tag)

  if (!match) {
    return false
  }

  if (entry) {
    return tag.startsWith('v') && !match[1]
  }

  return name ? match[1] === name : false
}
