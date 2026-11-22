// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { formatError } from '@reelout/core'
import { USER_AGENT } from './verifyAuth'

const SPARSE_INDEX_URL = 'https://index.crates.io'

/** One published version record of a crate in the sparse index. */
export interface CrateIndexRecord {
  /** The published version string. */
  vers: string

  /** The SHA-256 checksum of the published `.crate` file. */
  cksum: string

  /** Whether the version has been yanked. */
  yanked: boolean
}

/** The result of reading a crate's records from the sparse index. */
export type SparseIndexResult =
  { status: 'absent' } | { status: 'found'; records: CrateIndexRecord[] }

/** A per-run client for the crates.io sparse index. */
export interface SparseIndexClient {
  /**
   * Read a crate's records, reusing the cached result of a prior read.
   */
  getRecords(name: string): Promise<SparseIndexResult>

  /** Read a crate's records again, bypassing the cached result. */
  reload(name: string): Promise<SparseIndexResult>
}

/** Options for creating a sparse index client. */
export interface SparseIndexClientOptions {
  signal?: AbortSignal | undefined
}

/**
 * Create a per-run client for the crates.io sparse index.
 *
 * Reads crate version records over the sparse index protocol, caching each
 * crate's result so the publish-access check and the published-version
 * probe share a single request. `reload` bypasses the cache for recovery
 * after a publish-over conflict, when the index may have changed since the
 * first read. Failed reads are not cached, so a retry starts clean.
 *
 * @param options Client options carrying the release abort signal
 * @returns A sparse index client
 */
export function createSparseIndexClient(
  options: SparseIndexClientOptions = {}
): SparseIndexClient {
  const cache = new Map<string, SparseIndexResult>()

  const fetchRecords = async (name: string): Promise<SparseIndexResult> => {
    const response = await fetch(
      `${SPARSE_INDEX_URL}/${sparseIndexPath(name)}`,
      {
        headers: { 'User-Agent': USER_AGENT },
        ...(options.signal ? { signal: options.signal } : {}),
      }
    )

    if (response.status === 404) {
      return { status: 'absent' }
    }

    if (!response.ok) {
      throw new Error(
        `The sparse index could not be read for crate "${name}": HTTP ${response.status}.`
      )
    }

    return {
      status: 'found',
      records: parseIndexRecords(name, await response.text()),
    }
  }

  return {
    async getRecords(name) {
      const cached = cache.get(name)

      if (cached) {
        return cached
      }

      const result = await fetchRecords(name)

      cache.set(name, result)

      return result
    },

    async reload(name) {
      const result = await fetchRecords(name)

      cache.set(name, result)

      return result
    },
  }
}

/**
 * Map a crate name to its sparse index path.
 *
 * Follows the sparse index prefix rules: one-, two-, and three-character
 * names live under their length directories, and longer names under their
 * first two and next two characters.
 *
 * @param name The crate name
 * @returns The path of the crate's index records
 */
function sparseIndexPath(name: string): string {
  if (name.length === 1) {
    return `1/${name}`
  }

  if (name.length === 2) {
    return `2/${name}`
  }

  if (name.length === 3) {
    return `3/${name.charAt(0)}/${name}`
  }

  return `${name.slice(0, 2)}/${name.slice(2, 4)}/${name}`
}

/**
 * Parse the newline-delimited JSON records of a crate's index file.
 *
 * @param name The crate name the records belong to
 * @param text The raw index file text
 * @returns The parsed index records
 * @throws If a record is not valid JSON or does not carry the expected
 * fields
 */
function parseIndexRecords(name: string, text: string): CrateIndexRecord[] {
  const records: CrateIndexRecord[] = []

  for (const line of text.split('\n')) {
    if (line === '') {
      continue
    }

    records.push(parseIndexRecord(name, line))
  }

  return records
}

/**
 * Parse one sparse index record.
 *
 * @param name The crate name the record belongs to
 * @param line The raw record line
 * @returns The parsed index record
 * @throws If the line is not valid JSON or does not carry a version,
 * checksum, and yanked flag
 */
function parseIndexRecord(name: string, line: string): CrateIndexRecord {
  let data: unknown

  try {
    data = JSON.parse(line)
  } catch (error) {
    throw new Error(
      `The sparse index could not be read for crate "${name}": ${formatError(error)}`,
      { cause: error }
    )
  }

  const record =
    typeof data === 'object' && data !== null
      ? (data as { vers?: unknown; cksum?: unknown; yanked?: unknown })
      : undefined

  const vers = record?.vers

  const cksum = record?.cksum

  const yanked = record?.yanked

  if (
    typeof vers !== 'string' ||
    typeof cksum !== 'string' ||
    typeof yanked !== 'boolean'
  ) {
    throw new Error(
      `The sparse index could not be read for crate "${name}": unexpected record format.`
    )
  }

  return { vers, cksum, yanked }
}
