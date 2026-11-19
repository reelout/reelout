// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { ReleaseReport } from '#types'
import { isGitHubActions } from '#util'
import type { ConsolaInstance } from 'consola/core'
import { appendFileSync } from 'node:fs'
import {
  comparePlansByName,
  FALLBACK_RELEASE_ERROR_MESSAGE,
  formatPackageDirectory,
  type ReportPlan,
} from './utils'

const STATUS_LABELS = {
  success: 'Success',
  failure: 'Failure',
} as const

/**
 * Append a Markdown release report to the GitHub Actions job summary.
 *
 * Detects a GitHub Actions runner through the `GITHUB_ACTIONS` environment
 * variable and appends the rendered `report` to the file referenced by
 * `GITHUB_STEP_SUMMARY`, so GitHub displays it on the run summary page. Does
 * nothing outside GitHub Actions or when no summary file is configured, and
 * logs a warning instead of throwing when the summary file cannot be written.
 *
 * @param logger Logger instance for reporting summary write failures
 * @param env Readonly process environment variables object
 * @param report Release report containing status and package details
 */
export function appendReleaseReportSummary(
  logger: ConsolaInstance,
  env: Readonly<NodeJS.ProcessEnv>,
  report: ReleaseReport
): void {
  if (!isGitHubActions(env)) return

  const filePath = env.GITHUB_STEP_SUMMARY

  if (!filePath) return

  try {
    appendFileSync(filePath, `\n${formatReleaseReportSummary(report)}`)
  } catch (error) {
    logger.warn(
      `GitHub Actions job summary could not be written to "${filePath}": ${error instanceof Error ? error.message : error}`
    )
  }
}

const formatPackageLabel = (plan: ReportPlan): string => {
  if (plan.package.name) return `\`${plan.package.name}\``

  return `\`${formatPackageDirectory(plan.package.location)}\``
}

const formatReleaseReportSummary = (report: ReleaseReport): string => {
  const lines: string[] = ['## ReelOut Release Report', '']

  if (report.status) {
    lines.push(`**Status:** ${STATUS_LABELS[report.status]}`, '')
  }

  if (report.status === 'failure') {
    const message = report.error || FALLBACK_RELEASE_ERROR_MESSAGE

    lines.push(...message.split('\n').map((line) => `> ${line}`), '')

    return lines.join('\n')
  }

  if (report.plans.length === 0) {
    lines.push('No packages are scheduled for release.', '')

    return lines.join('\n')
  }

  const plans = report.plans.toSorted(comparePlansByName)

  lines.push('| Package | Version | Type | Tag |', '| --- | --- | --- | --- |')

  for (const plan of plans) {
    const version = `\`${plan.release.version}\` ← \`${plan.package.version}\``

    lines.push(
      [
        `| ${formatPackageLabel(plan)}`,
        version,
        plan.release.type,
        plan.release.tag ? `\`${plan.release.tag}\`` : '',
      ].join(' | ') + ' |'
    )
  }

  lines.push('')

  for (const plan of plans) {
    const changelog = plan.release.changelog?.trim()

    if (!changelog) continue

    lines.push(
      '<details>',
      `<summary>${formatPackageLabel(plan)} ${plan.release.version}</summary>`,
      '',
      changelog,
      '',
      '</details>',
      ''
    )
  }

  return lines.join('\n')
}
