// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { ReleasePlan } from '@reelout/core'
import fs from 'node:fs/promises'
import path from 'node:path'
import { CARGO_DEPENDENCY_TABLES, CARGO_MANIFEST_FILE } from './readCargoToml'

const DEPENDENCY_TABLE_NAMES: Set<string> = new Set(CARGO_DEPENDENCY_TABLES)

const HEADER_PATTERN = /^\s*\[+([^\]]+)\]/

const VERSION_LINE_PATTERN = /^(\s*version\s*=\s*")([^"]*)(".*)$/

const INLINE_REQUIREMENT_PATTERN =
  /^(\s*)([A-Za-z0-9_-]+)(\s*=\s*)"([^"]*)"(.*)$/

const INLINE_TABLE_PATTERN = /^(\s*)([A-Za-z0-9_-]+)(\s*=\s*)(\{.*)$/

const INLINE_TABLE_VERSION_PATTERN = /([{,]\s*version\s*=\s*")([^"]*)(")/

/** A Cargo manifest text held in memory while its edits are applied. */
interface ManifestFile {
  filePath: string
  text: string
  original: string
}

/** The result of replacing a version value inside one manifest section. */
interface SectionVersionEdit {
  text: string
  replaced: boolean
}

/**
 * Update crate versions and internal dependency requirements across a
 * Cargo workspace.
 *
 * Builds a map of crates that have a new release version, then applies
 * targeted text edits to the workspace manifests so comments and
 * formatting survive: each released crate's literal `[package] version`,
 * the root `[workspace.package] version` shared by crates inheriting their
 * version, and every internal dependency requirement, preserving the
 * original `^`, `~`, or `=` prefix. Workspace-inherited dependency
 * references (`name.workspace = true`) are left untouched, as Cargo
 * resolves them from `[workspace.dependencies]`, whose literal
 * requirements are bumped in the root manifest.
 *
 * Only manifests that actually changed are written back to disk.
 *
 * Crates inheriting the workspace version share the single root
 * `[workspace.package]` version, so they must be planned at the same
 * version; divergent plans fail before any manifest is written.
 *
 * @param cwd Absolute path to the workspace root
 * @param plans Release plans containing crate metadata and target versions
 * @returns True when at least one manifest was modified
 * @throws If crates inheriting the workspace version were planned at
 * different versions
 */
export async function bumpCargoManifests(
  cwd: string,
  plans: readonly ReleasePlan[]
): Promise<boolean> {
  const versionMap = new Map<string, string>()

  for (const plan of plans) {
    if (plan.package.name && plan.release?.version) {
      versionMap.set(plan.package.name, plan.release.version)
    }
  }

  if (versionMap.size === 0) {
    return false
  }

  const manifestFiles = new Map<string, ManifestFile>()

  /**
   * Load a directory's manifest text, caching it for further edits.
   *
   * @param dir Directory holding the manifest
   * @returns The cached manifest file entry
   */
  const loadManifest = async (dir: string): Promise<ManifestFile> => {
    const filePath = path.join(dir, CARGO_MANIFEST_FILE)

    let file = manifestFiles.get(filePath)

    if (!file) {
      const text = await fs.readFile(filePath, 'utf-8')

      file = { filePath, text, original: text }

      manifestFiles.set(filePath, file)
    }

    return file
  }

  const rootManifest = await loadManifest(cwd)

  rootManifest.text = updateDependencyRequirements(
    rootManifest.text,
    versionMap
  )

  let sharedVersionPlan: { name: string; version: string } | undefined

  for (const plan of plans) {
    const crateDir = path.join(cwd, plan.package.location)

    const manifest = await loadManifest(crateDir)

    if (plan.release?.version) {
      const edit = setSectionVersion(
        manifest.text,
        'package',
        plan.release.version
      )

      if (edit.replaced) {
        manifest.text = edit.text
      } else {
        const planName = plan.package.name ?? plan.package.location

        if (
          sharedVersionPlan !== undefined &&
          sharedVersionPlan.version !== plan.release.version
        ) {
          throw new Error(
            `Crates "${sharedVersionPlan.name}" and "${planName}" inherit the workspace version but were planned at different versions ("${sharedVersionPlan.version}" and "${plan.release.version}").`
          )
        }

        sharedVersionPlan = { name: planName, version: plan.release.version }

        const rootEdit = setSectionVersion(
          rootManifest.text,
          'workspace.package',
          plan.release.version
        )

        rootManifest.text = rootEdit.text
      }
    }

    manifest.text = updateDependencyRequirements(manifest.text, versionMap)
  }

  let changed = false

  for (const file of manifestFiles.values()) {
    if (file.text !== file.original) {
      await fs.writeFile(file.filePath, file.text, 'utf-8')

      changed = true
    }
  }

  return changed
}

/**
 * Replace the `version` value inside one manifest section.
 *
 * Walks the manifest lines, tracking the current section header, and
 * replaces the first `version = "…"` assignment inside the target section
 * while leaving every other line byte-identical.
 *
 * @param text The manifest text to edit
 * @param section The dotted section path to edit, such as `package` or
 * `workspace.package`
 * @param newVersion The version value to write
 * @returns The edited text and whether a version assignment was found
 */
function setSectionVersion(
  text: string,
  section: string,
  newVersion: string
): SectionVersionEdit {
  const lines = text.split('\n')

  let sectionPath: string[] = []

  for (const [index, line] of lines.entries()) {
    const headerName = HEADER_PATTERN.exec(line)?.[1]

    if (headerName !== undefined) {
      sectionPath = headerName.split('.')
      continue
    }

    if (sectionPath.join('.') !== section) {
      continue
    }

    const match = VERSION_LINE_PATTERN.exec(line)

    if (match) {
      lines[index] = `${match[1]}${newVersion}${match[3]}`

      return { text: lines.join('\n'), replaced: true }
    }
  }

  return { text, replaced: false }
}

/**
 * Update internal dependency requirements across all dependency sections
 * of a manifest.
 *
 * Walks the manifest lines, tracking section headers, and rewrites every
 * dependency whose name is being released: string requirements
 * (`name = "1.2.3"`), inline table versions
 * (`name = { version = "1.2.3" }`), and `[…dependencies.name]` sub-table
 * version assignments. Prefixes are preserved and workspace-inherited
 * references are skipped, so only literal requirements change.
 *
 * @param text The manifest text to edit
 * @param versionMap Map of released crate names to their new versions
 * @returns The edited manifest text
 */
function updateDependencyRequirements(
  text: string,
  versionMap: ReadonlyMap<string, string>
): string {
  const lines = text.split('\n')

  let sectionPath: string[] = []

  for (const [index, line] of lines.entries()) {
    const headerName = HEADER_PATTERN.exec(line)?.[1]

    if (headerName !== undefined) {
      sectionPath = headerName.split('.')
      continue
    }

    if (sectionPath.length === 0) {
      continue
    }

    const lastSegment = sectionPath[sectionPath.length - 1]

    /* istanbul ignore if -- a non-empty section path always has a last segment */
    if (lastSegment === undefined) {
      continue
    }

    if (DEPENDENCY_TABLE_NAMES.has(lastSegment)) {
      lines[index] = updateInlineDependencyLine(line, versionMap)
      continue
    }

    if (
      versionMap.has(lastSegment) &&
      sectionPath
        .slice(0, -1)
        .some((segment) => DEPENDENCY_TABLE_NAMES.has(segment))
    ) {
      const newVersion = versionMap.get(lastSegment)

      /* istanbul ignore if -- versionMap.has(lastSegment) guarantees a version */
      if (newVersion === undefined) {
        continue
      }

      const match = VERSION_LINE_PATTERN.exec(line)

      if (match?.[2] !== undefined) {
        lines[index] =
          `${match[1]}${withPreservedPrefix(match[2], newVersion)}${match[3]}`
      }
    }
  }

  return lines.join('\n')
}

/**
 * Update a dependency line inside an inline dependency section.
 *
 * Rewrites the requirement when the line declares a released crate as a
 * string requirement or as an inline table with a literal version, and
 * returns the line unchanged otherwise, including workspace-inherited
 * references.
 *
 * @param line The manifest line to edit
 * @param versionMap Map of released crate names to their new versions
 * @returns The edited line
 */
function updateInlineDependencyLine(
  line: string,
  versionMap: ReadonlyMap<string, string>
): string {
  const requirement = INLINE_REQUIREMENT_PATTERN.exec(line)

  if (requirement?.[2] !== undefined) {
    const newVersion = versionMap.get(requirement[2])

    if (newVersion !== undefined && requirement[4] !== undefined) {
      return `${requirement[1]}${requirement[2]}${requirement[3]}"${withPreservedPrefix(requirement[4], newVersion)}"${requirement[5]}`
    }

    return line
  }

  const table = INLINE_TABLE_PATTERN.exec(line)

  if (table?.[2] !== undefined) {
    const newVersion = versionMap.get(table[2])

    if (newVersion === undefined) {
      return line
    }

    const rest = table[4]?.replace(
      INLINE_TABLE_VERSION_PATTERN,
      (_match, prefix: string, oldRequirement: string, suffix: string) =>
        `${prefix}${withPreservedPrefix(oldRequirement, newVersion)}${suffix}`
    )

    /* istanbul ignore if -- a matched inline table always has a tail */
    if (rest === undefined) {
      return line
    }

    return `${table[1]}${table[2]}${table[3]}${rest}`
  }

  return line
}

/**
 * Rebuild a dependency requirement for a new version, preserving the
 * original `^`, `~`, or `=` prefix.
 *
 * @param oldRequirement The requirement being replaced
 * @param newVersion The new version to target
 * @returns The new requirement carrying the old prefix, when it had one
 */
function withPreservedPrefix(
  oldRequirement: string,
  newVersion: string
): string {
  const prefix = /^[\^~=]/.exec(oldRequirement)?.[0] ?? ''

  return `${prefix}${newVersion}`
}
