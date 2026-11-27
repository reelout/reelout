// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { DEFAULT_CHANGELOG_FILE } from '#config'
import type { GitCommit, ReleaseContext } from '#types'
import { formatFile } from '#util'
import createPreset from 'conventional-changelog-conventionalcommits'
import {
  writeChangelogString,
  type CommitKnownProps,
  type FinalTemplateContext,
  type Options,
  type TemplateContext,
} from 'conventional-changelog-writer'
import path from 'node:path'

export interface BuildChangelogOptions {
  packageDir?: string | undefined
  changelogFile?: string | undefined
  version?: string | null | undefined
  previousTag?: string | null | undefined
  currentTag?: string | null | undefined
}

interface ConventionalCommitsPreset {
  writer: Options
}

let presetCache: ConventionalCommitsPreset | undefined

/**
 * Load the conventional commits preset on first use.
 *
 * Creating the preset performs setup work that used to run at import time
 * through a module-level await; loading it lazily keeps importing this
 * module synchronous and skips the cost for consumers that never build a
 * changelog.
 *
 * @returns The cached preset, created on the first call
 */
async function loadPreset(): Promise<ConventionalCommitsPreset> {
  presetCache ??= await createPreset()

  return presetCache
}

/**
 * Build the changelog string for a release.
 *
 * Compiles commit history and release context into a formatted changelog using
 * conventional commits and writer configurations. Resolves file paths and handles
 * tag comparisons when repository URLs are available.
 *
 * @param context The release context containing repository and working directory details
 * @param history The iterable or async iterable collection of commits to process
 * @param options The build configuration options for the changelog
 * @returns The formatted changelog content string
 */
export async function buildChangelog(
  context: ReleaseContext,
  history: Iterable<GitCommit> | AsyncIterable<GitCommit>,
  options: BuildChangelogOptions = {}
): Promise<string> {
  const preset = await loadPreset()

  const repository = context.repository?.url || undefined

  const version = options.version || undefined

  const previousTag = options.previousTag || undefined

  const currentTag = options.currentTag || undefined

  const filePath = path.join(
    context.cwd,
    options.packageDir || '.',
    options.changelogFile || DEFAULT_CHANGELOG_FILE
  )

  const headerPartial = (context: FinalTemplateContext) => {
    return context.version ? preset.writer.headerPartial?.(context) : undefined
  }

  const content = await writeChangelogString<CommitKnownProps>(
    history,
    {
      date: context.today,
      version,
      previousTag,
      currentTag,
      linkCompare: !!repository && !!previousTag && !!currentTag,
      linkReferences: !!repository,
      repoUrl: repository,
      commit: 'commit',
      issue: 'issues',
      headerPartial,
    } as TemplateContext,
    preset.writer
  )

  return formatFile(filePath, content, context.logger)
}
