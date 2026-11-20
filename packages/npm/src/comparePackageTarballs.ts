// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { createHash } from 'node:crypto'
import path from 'node:path'
import { isEqual } from 'lodash-es'
import { Parser, type ReadEntry } from 'tar'

/**
 * The result of comparing a published package tarball against a locally packed
 * tarball by logical content.
 *
 * - `identical`: both tarballs carry the same logical content.
 * - `different`: the tarballs carry different logical content; `summary` names
 *   the files with differing content and the files present on only one side.
 * - `undeterminable`: a tarball could not be extracted or parsed; `reason`
 *   explains the failure.
 */
export type PackageTarballVerdict =
  | { verdict: 'identical' }
  | { verdict: 'different'; summary: string }
  | { verdict: 'undeterminable'; reason: string }

interface TarballEntry {
  type: string
  content: Buffer
  linkpath: string | undefined
}

const PACKAGE_JSON_PATH = 'package.json'

const PUBLISH_MUTATED_PACKAGE_JSON_FIELDS = ['_id', 'gitHead'] as const

/**
 * Compare a published package tarball with a locally packed tarball by logical
 * content.
 *
 * Extracts both tarballs in memory and compares normalized file lists with
 * per-file SHA-256 content hashes, excluding tar-level metadata such as entry
 * order, modification times, file modes, and user or group ids. Strips a
 * single leading package folder (for example `package/`) from each side
 * before comparing, and decompresses gzip-compressed tarballs transparently.
 * The `package.json` manifests are compared semantically: fields that publish
 * tooling may mutate (`_id`, `gitHead`) and JSON formatting differences are
 * ignored, while any other semantic difference counts as different content.
 *
 * @param published Tarball buffer fetched from the registry
 * @param local Tarball buffer packed from the local package
 * @returns A verdict describing whether the tarballs are logically identical, differ in content, or could not be compared
 */
export function comparePackageTarballs(
  published: Buffer,
  local: Buffer
): PackageTarballVerdict {
  const publishedEntries = parseTarballEntries(published)

  if (publishedEntries instanceof Error) {
    return {
      verdict: 'undeterminable',
      reason: `published tarball could not be parsed: ${publishedEntries.message}`,
    }
  }

  const localEntries = parseTarballEntries(local)

  if (localEntries instanceof Error) {
    return {
      verdict: 'undeterminable',
      reason: `local tarball could not be parsed: ${localEntries.message}`,
    }
  }

  const normalizedPublishedEntries = stripCommonRoot(publishedEntries)
  const normalizedLocalEntries = stripCommonRoot(localEntries)

  const differingContent: string[] = []
  const onlyInPublished: string[] = []
  const onlyInLocal: string[] = []

  for (const [entryPath, publishedEntry] of normalizedPublishedEntries) {
    const localEntry = normalizedLocalEntries.get(entryPath)

    if (localEntry === undefined) {
      onlyInPublished.push(entryPath)
    } else if (!isSameEntry(entryPath, publishedEntry, localEntry)) {
      differingContent.push(entryPath)
    }
  }

  for (const entryPath of normalizedLocalEntries.keys()) {
    if (!normalizedPublishedEntries.has(entryPath)) {
      onlyInLocal.push(entryPath)
    }
  }

  if (
    differingContent.length === 0 &&
    onlyInPublished.length === 0 &&
    onlyInLocal.length === 0
  ) {
    return { verdict: 'identical' }
  }

  differingContent.sort()
  onlyInPublished.sort()
  onlyInLocal.sort()

  const summaryParts: string[] = []

  if (differingContent.length > 0) {
    summaryParts.push(`different content in: ${differingContent.join(', ')}`)
  }

  if (onlyInPublished.length > 0) {
    summaryParts.push(
      `only in published tarball: ${onlyInPublished.join(', ')}`
    )
  }

  if (onlyInLocal.length > 0) {
    summaryParts.push(`only in local tarball: ${onlyInLocal.join(', ')}`)
  }

  return { verdict: 'different', summary: summaryParts.join('; ') }
}

/**
 * Extract the comparable entries of a tarball buffer into a map keyed by
 * normalized entry path.
 *
 * Treats tar metadata (pax headers) and directory entries as non-comparable,
 * and returns an error instead of a map when the buffer triggers any parse
 * warning or error, since corrupted input must never compare as content.
 *
 * @param tarball The tarball buffer to extract
 * @returns A map of entry paths to entry records, or an error describing the first parse problem
 */
function parseTarballEntries(
  tarball: Buffer
): Map<string, TarballEntry> | Error {
  const entries = new Map<string, TarballEntry>()
  const problems: string[] = []

  const parser = new Parser()

  parser.on('warn', (code: string, message: string) => {
    problems.push(`${code}: ${message}`)
  })

  parser.on('error', (error: NodeJS.ErrnoException) => {
    problems.push(`${error.code}: ${error.message}`)
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

  return problems.length > 0 ? new Error(problems[0]) : entries
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
 * @param publishedEntry The entry extracted from the published tarball
 * @param localEntry The entry extracted from the local tarball
 * @returns True if the entries are logically equal, otherwise false
 */
function isSameEntry(
  entryPath: string,
  publishedEntry: TarballEntry,
  localEntry: TarballEntry
): boolean {
  if (publishedEntry.type !== localEntry.type) {
    return false
  }

  if (entryPath === PACKAGE_JSON_PATH && publishedEntry.type === 'File') {
    return isSemanticallyEqualPackageJson(
      publishedEntry.content,
      localEntry.content
    )
  }

  if (publishedEntry.type === 'File') {
    return sha256(publishedEntry.content) === sha256(localEntry.content)
  }

  return publishedEntry.linkpath === localEntry.linkpath
}

/**
 * Compare two `package.json` manifests semantically, ignoring publish-mutated
 * fields and JSON formatting.
 *
 * @param publishedManifest The manifest content from the published tarball
 * @param localManifest The manifest content from the local tarball
 * @returns True if the manifests are semantically equal, otherwise false
 */
function isSemanticallyEqualPackageJson(
  publishedManifest: Buffer,
  localManifest: Buffer
): boolean {
  const publishedJson = parseJsonObject(publishedManifest)
  const localJson = parseJsonObject(localManifest)

  if (publishedJson === null || localJson === null) {
    return false
  }

  for (const field of PUBLISH_MUTATED_PACKAGE_JSON_FIELDS) {
    delete publishedJson[field]
    delete localJson[field]
  }

  return isEqual(publishedJson, localJson)
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
