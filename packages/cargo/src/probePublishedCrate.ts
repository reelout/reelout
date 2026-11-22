// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { SparseIndexClient } from './sparseIndex'

/** Options for probing a crate version in the sparse index. */
export interface ProbePublishedCrateOptions {
  index: SparseIndexClient

  /** Read the records again, bypassing the client's cache. */
  fresh?: boolean | undefined
}

/**
 * The result of probing the sparse index for a crate version.
 *
 * - `absent`: the registry does not hold the crate version.
 * - `published`: the registry holds the crate version, along with the
 *   checksum of its published `.crate` file.
 */
export type PublishedCrateStatus =
  { status: 'absent' } | { status: 'published'; cksum: string }

/**
 * Probe the sparse index for a crate version.
 *
 * Reads the crate's records through the shared index client and reports
 * whether the target version is published, along with its recorded
 * checksum. A fresh probe bypasses the client's cache, for recovery after
 * a publish-over conflict.
 *
 * @param name The crate name to probe
 * @param version The crate version to probe
 * @param options Probe options carrying the index client
 * @returns The published version's checksum, or absent status
 */
export async function probePublishedCrate(
  name: string,
  version: string,
  options: ProbePublishedCrateOptions
): Promise<PublishedCrateStatus> {
  const records =
    options.fresh === true
      ? await options.index.reload(name)
      : await options.index.getRecords(name)

  if (records.status === 'absent') {
    return { status: 'absent' }
  }

  const record = records.records.find((entry) => entry.vers === version)

  if (record === undefined) {
    return { status: 'absent' }
  }

  return { status: 'published', cksum: record.cksum }
}
