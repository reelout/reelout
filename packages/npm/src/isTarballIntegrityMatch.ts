// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { createHash } from 'node:crypto'

/**
 * Determine whether a tarball matches a registry-recorded integrity value.
 *
 * Parses Subresource Integrity strings such as `sha512-<base64>`, hashes the
 * tarball with the recorded algorithm, and compares the digest, so a match
 * proves the tarball bytes are identical to the published ones without
 * downloading or extracting them. Malformed values and unsupported
 * algorithms never match, deferring to the content comparison instead.
 *
 * @param tarball The tarball buffer to verify
 * @param integrity The registry-recorded integrity value
 * @returns True when the tarball hash equals the recorded digest
 */
export function isTarballIntegrityMatch(
  tarball: Buffer,
  integrity: string
): boolean {
  const separatorIndex = integrity.indexOf('-')

  if (separatorIndex <= 0) {
    return false
  }

  const algorithm = integrity.slice(0, separatorIndex)
  const digest = integrity.slice(separatorIndex + 1)

  try {
    return createHash(algorithm).update(tarball).digest('base64') === digest
  } catch {
    return false
  }
}
