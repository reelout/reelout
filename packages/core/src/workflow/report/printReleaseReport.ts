// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { ReleaseReport } from '#types'
import type { ConsolaInstance } from 'consola/core'
import { colors } from 'consola/utils'
import {
  comparePlansByName,
  FALLBACK_RELEASE_ERROR_MESSAGE,
  formatPackageDirectory,
} from './utils'

/**
 * Print a formatted release report to the logger.
 *
 * Logs workflow `status` and details for planned package releases. Displays
 * package names, directories, and version changes on success, or outputs the
 * error message on failure.
 *
 * @param logger Logger instance for outputting messages
 * @param report Release report containing status and package details
 */
export function printReleaseReport(
  logger: ConsolaInstance,
  report: ReleaseReport
): void {
  if (report.status) {
    const statusLabel = {
      success: colors.green('SUCCESS'),
      failure: colors.red('FAILURE'),
    }[report.status]

    logger.info(`Status: ${statusLabel}`)
  }

  if (report.status === 'failure') {
    return logger.error(
      [
        'Release complete:',
        colors.red(report.error || FALLBACK_RELEASE_ERROR_MESSAGE),
      ].join(' ')
    )
  }

  if (report.plans.length === 0) {
    return logger.info(
      [
        'Release complete:',
        colors.yellow('No packages are scheduled for release.'),
      ].join(' ')
    )
  }

  const header = [
    'Release complete:',
    colors.bold(colors.green(`${report.plans.length} released`)),
    colors.gray(`(${report.packages.length})`),
  ].join(' ')

  const list = report.plans
    .toSorted(comparePlansByName)
    .map((plan) => {
      const dir = formatPackageDirectory(plan.package.location)

      const name = plan.package.name
        ? colors.bgBlue(` ${plan.package.name} `)
        : !plan.package.entry && colors.gray(` ${dir} `)

      let version = [plan.release.version, plan.package.version].join(' ← ')

      version = ` ${version} `

      const type = plan.release.type && colors.gray(` ${plan.release.type} `)

      const summary = [
        name,
        plan.release.type === 'major'
          ? colors.bgRed(version)
          : colors.bgGreen(version),
        type,
      ]
        .filter(Boolean)
        .join('')

      const changelog = plan.release.changelog
        ?.replace(/^(#+ .+)$/gm, (_, header) => colors.cyan(header))
        .trim()

      return [summary, changelog].filter(Boolean).join('\n\n')
    })
    .join('\n\n')

  logger.info(`${header}\n\n${list}\n`)
}
