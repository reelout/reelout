// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { createHash } from 'node:crypto'
import path from 'node:path'
import { isEqual } from 'lodash-es'
import { Parser, type ReadEntry } from 'tar'

interface TarballEntry {
  type: string
  content: Buffer
  linkpath: string | undefined
}

const PACKAGE_JSON_PATH = 'package.json'

const PUBLISH_MUTATED_PACKAGE_JSON_FIELDS = ['_id', 'gitHead'] as const

/**
 * Determine whether a published and a locally packed package tarball carry
 * the same logical content.
 *
 * Extracts both tarballs in memory and compares normalized file lists with
 * per-file SHA-256 content hashes, excluding tar-level metadata such as entry
 * order, modification times, file modes, and user or group ids. Strips a
 * single leading package folder (for example `package/`) from each side
 * before comparing, and decompresses gzip-compressed tarballs transparently.
 * The `package.json` manifests are compared semantically: fields that publish
 * tooling may mutate (`_id`, `gitHead`) and JSON formatting differences are
 * ignored, while any other semantic difference counts as different content.
 * Tarballs that cannot be extracted or parsed are never identical.
 *
 * @param left Tarball buffer fetched from the registry
 * @param right Tarball buffer packed from the local package
 * @returns True when both tarballs carry the same logical content
 */
export function isPackageTarballIdentical(
  left: Buffer,
  right: Buffer
): boolean {
  const leftEntries = parseTarballEntries(left)

  if (leftEntries === null) {
    return false
  }

  const rightEntries = parseTarballEntries(right)

  if (rightEntries === null) {
    return false
  }

  const normalizedLeftEntries = stripCommonRoot(leftEntries)
  const normalizedRightEntries = stripCommonRoot(rightEntries)

  if (normalizedLeftEntries.size !== normalizedRightEntries.size) {
    return false
  }

  for (const [entryPath, leftEntry] of normalizedLeftEntries) {
    const rightEntry = normalizedRightEntries.get(entryPath)

    if (rightEntry === undefined) {
      return false
    }

    if (!isSameEntry(entryPath, leftEntry, rightEntry)) {
      return false
    }
  }

  return true
}

/**
 * Extract the comparable entries of a tarball buffer into a map keyed by
 * normalized entry path.
 *
 * Treats tar metadata (pax headers) and directory entries as non-comparable,
 * and returns null instead of a map when the buffer triggers any parse
 * warning or error, since corrupted input must never compare as content.
 *
 * @param tarball The tarball buffer to extract
 * @returns A map of entry paths to entry records, or null when the tarball
 * cannot be parsed
 */
function parseTarballEntries(
  tarball: Buffer
): Map<string, TarballEntry> | null {
  const entries = new Map<string, TarballEntry>()

  let failed = false

  const parser = new Parser()

  parser.on('warn', () => {
    failed = true
  })

  parser.on('error', () => {
    failed = true
  })

  parser.on('entry', (entry: ReadEntry) => {
    if (entry.meta || entry.type === 'Directory') {
      entry.resume()
      return
    }

    const chunks: Buffer[] = []

    entry.on('data', (chunk: Buffer) => {
      chunks.push(chunk)
    })

    entry.on('end', () => {
      entries.set(normalizeEntryPath(entry.path), {
        type: entry.type,
        content: Buffer.concat(chunks),
        linkpath: entry.linkpath,
      })
    })
  })

  parser.end(tarball)

  return failed ? null : entries
}

/**
 * Normalize a tar entry path for comparison.
 *
 * @param entryPath The raw entry path from the tar header
 * @returns The normalized POSIX-style path
 */
function normalizeEntryPath(entryPath: string): string {
  return path.posix.normalize(entryPath).replace(/^\.\//, '')
}

/**
 * Strip the single leading package folder from every entry path.
 *
 * Registry tarballs nest their files under a root folder (commonly
 * `package/`), which package managers name differently; the folder is
 * tar-level structure, not logical content.
 *
 * @param entries The extracted entries keyed by normalized path
 * @returns The entries keyed by path with the shared root folder removed
 */
function stripCommonRoot(
  entries: Map<string, TarballEntry>
): Map<string, TarballEntry> {
  const entryPaths = [...entries.keys()]

  if (
    entryPaths.length === 0 ||
    entryPaths.some((entryPath) => !entryPath.includes('/'))
  ) {
    return entries
  }

  const rootSegments = new Set(
    entryPaths.map((entryPath) => entryPath.slice(0, entryPath.indexOf('/')))
  )

  if (rootSegments.size !== 1) {
    return entries
  }

  const strippedEntries = new Map<string, TarballEntry>()

  for (const [entryPath, entry] of entries) {
    strippedEntries.set(entryPath.slice(entryPath.indexOf('/') + 1), entry)
  }

  return strippedEntries
}

/**
 * Determine whether two entries with the same path carry the same logical
 * content.
 *
 * @param entryPath The normalized path shared by both entries
 * @param leftEntry The entry extracted from the published tarball
 * @param rightEntry The entry extracted from the local tarball
 * @returns True if the entries are logically equal, otherwise false
 */
function isSameEntry(
  entryPath: string,
  leftEntry: TarballEntry,
  rightEntry: TarballEntry
): boolean {
  if (leftEntry.type !== rightEntry.type) {
    return false
  }

  if (entryPath === PACKAGE_JSON_PATH && leftEntry.type === 'File') {
    return isSemanticallyEqualPackageJson(leftEntry.content, rightEntry.content)
  }

  if (leftEntry.type === 'File') {
    return sha256(leftEntry.content) === sha256(rightEntry.content)
  }

  return leftEntry.linkpath === rightEntry.linkpath
}

/**
 * Compare two `package.json` manifests semantically, ignoring publish-mutated
 * fields and JSON formatting.
 *
 * @param leftManifest The manifest content from the published tarball
 * @param rightManifest The manifest content from the local tarball
 * @returns True if the manifests are semantically equal, otherwise false
 */
function isSemanticallyEqualPackageJson(
  leftManifest: Buffer,
  rightManifest: Buffer
): boolean {
  const leftJson = parseJsonObject(leftManifest)
  const rightJson = parseJsonObject(rightManifest)

  if (leftJson === null || rightJson === null) {
    return false
  }

  for (const field of PUBLISH_MUTATED_PACKAGE_JSON_FIELDS) {
    delete leftJson[field]
    delete rightJson[field]
  }

  return isEqual(leftJson, rightJson)
}

/**
 * Parse a buffer as a JSON object.
 *
 * @param content The buffer to parse
 * @returns The parsed object, or null when the content is not a JSON object
 */
function parseJsonObject(content: Buffer): Record<string, unknown> | null {
  let parsed: unknown

  try {
    parsed = JSON.parse(content.toString('utf-8'))
  } catch {
    return null
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return null
  }

  return parsed as Record<string, unknown>
}

/**
 * Hash content with SHA-256.
 *
 * @param content The content to hash
 * @returns The hex-encoded SHA-256 digest
 */
function sha256(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex')
}
