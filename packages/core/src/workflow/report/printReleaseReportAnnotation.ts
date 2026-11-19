// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { ReleaseReport } from '#types'
import { isGitHubActions } from '#util'
import { resolveOutcomeErrorMessage } from './resolveErrorMessage'

/**
 * Print a GitHub Actions error annotation for a failed release.
 *
 * Detects a GitHub Actions runner through the `GITHUB_ACTIONS` environment
 * variable and writes a `::error` workflow command carrying the failure
 * reason to `stdout`, so GitHub surfaces the failure as an annotation on the
 * run page. Does nothing outside GitHub Actions or when the release did not
 * fail.
 *
 * @param env Readonly process environment variables object
 * @param stdout Writable stream receiving the annotation command
 * @param report Release report containing outcome and failure details
 */
export function printReleaseReportAnnotation(
  env: Readonly<NodeJS.ProcessEnv>,
  stdout: NodeJS.WritableStream,
  report: ReleaseReport
): void {
  if (!isGitHubActions(env) || report.outcome?.status !== 'failure') return

  const message = formatAnnotationMessage(
    resolveOutcomeErrorMessage(report.outcome)
  )

  stdout.write(`::error title=Release failed::${message}\n`)
}

const formatAnnotationMessage = (message: string): string =>
  message.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')
