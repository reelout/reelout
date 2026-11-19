// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import {
  appendReleaseReportSummary,
  generateReleaseReport,
  type ReleasePlan,
} from '@reelout/core'
import fs from 'node:fs/promises'
import path from 'node:path'
import { temporaryDirectoryTask } from 'tempy'
import { expect, test } from 'vitest'
import { context, logger } from '../../../../../test/mock/context'
import { createReport } from '../../../../../test/mock/report'

test('appends the markdown report to the job summary when running on GitHub Actions', async () => {
  await temporaryDirectoryTask(async (directory) => {
    const filePath = path.join(directory, 'summary.md')

    context.plans = [
      {
        package: { location: 'packages/foo', name: 'foo', version: '1.0.0' },
        release: {
          type: 'minor',
          version: '1.1.0',
          tag: { name: 'foo@1.1.0' },
          changelog: '## 1.1.0\n\n### Features\n\n- Introduce new feature\n',
        },
      },
      {
        package: { location: 'packages/bar', name: 'bar', version: '2.0.0' },
        release: {
          type: 'major',
          version: '3.0.0',
          changelog: '## 3.0.0\n\n### Breaking Changes\n\n- Major update\n',
        },
      },
    ] as ReleasePlan[]

    const report = generateReleaseReport(context)

    appendReleaseReportSummary(
      context.logger,
      { GITHUB_ACTIONS: 'true', GITHUB_STEP_SUMMARY: filePath },
      { ...report, status: 'success' }
    )

    expect(await fs.readFile(filePath, 'utf-8')).toMatchInlineSnapshot(`
      "
      ## ReelOut Release Report

      **Status:** Success

      | Package | Version | Type | Tag |
      | --- | --- | --- | --- |
      | \`bar\` | \`3.0.0\` ← \`2.0.0\` | major |  |
      | \`foo\` | \`1.1.0\` ← \`1.0.0\` | minor | \`foo@1.1.0\` |

      <details>
      <summary>\`bar\` 3.0.0</summary>

      ## 3.0.0

      ### Breaking Changes

      - Major update

      </details>

      <details>
      <summary>\`foo\` 1.1.0</summary>

      ## 1.1.0

      ### Features

      - Introduce new feature

      </details>
      "
    `)
  })
})

test('appends the failure status and error message when the release failed', async () => {
  await temporaryDirectoryTask(async (directory) => {
    const filePath = path.join(directory, 'summary.md')

    appendReleaseReportSummary(
      context.logger,
      { GITHUB_ACTIONS: 'true', GITHUB_STEP_SUMMARY: filePath },
      createReport({
        status: 'failure',
        error: 'Publish failed\nPlease check NPM_TOKEN',
      })
    )

    expect(await fs.readFile(filePath, 'utf-8')).toMatchInlineSnapshot(`
      "
      ## ReelOut Release Report

      **Status:** Failure

      > Publish failed
      > Please check NPM_TOKEN
      "
    `)
  })
})

test('appends the empty-state message when no packages are scheduled for release', async () => {
  await temporaryDirectoryTask(async (directory) => {
    const filePath = path.join(directory, 'summary.md')

    appendReleaseReportSummary(
      context.logger,
      { GITHUB_ACTIONS: 'true', GITHUB_STEP_SUMMARY: filePath },
      createReport({ status: 'success' })
    )

    expect(await fs.readFile(filePath, 'utf-8')).toMatchInlineSnapshot(`
      "
      ## ReelOut Release Report

      **Status:** Success

      No packages are scheduled for release.
      "
    `)
  })
})

test('does not create the summary file when the GitHub Actions flag is absent', async () => {
  await temporaryDirectoryTask(async (directory) => {
    const filePath = path.join(directory, 'summary.md')

    appendReleaseReportSummary(
      context.logger,
      { GITHUB_STEP_SUMMARY: filePath },
      createReport({ status: 'success' })
    )

    await expect(fs.readFile(filePath, 'utf-8')).rejects.toThrow()
    expect(logger.mock.calls).toEqual([])
  })
})

test('does not write a summary when no summary file is configured', () => {
  appendReleaseReportSummary(
    context.logger,
    { GITHUB_ACTIONS: 'true' },
    createReport({ status: 'success' })
  )

  expect(logger.mock.calls).toEqual([])
})

test('logs a warning when the summary file cannot be written', async () => {
  await temporaryDirectoryTask(async (directory) => {
    appendReleaseReportSummary(
      context.logger,
      {
        GITHUB_ACTIONS: 'true',
        GITHUB_STEP_SUMMARY: path.join(directory, 'missing', 'summary.md'),
      },
      createReport({ status: 'success' })
    )

    expect(logger.mock.calls).toHaveLength(1)

    const [warning] = logger.mock.calls

    expect(warning?.[0]).toMatch(
      /^GitHub Actions job summary could not be written to ".+": ENOENT/
    )
  })
})
