// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { ReleaseReport } from '#types'
import path from 'node:path'

/**
 * Fallback message used when a release fails without an error message.
 */
export const FALLBACK_RELEASE_ERROR_MESSAGE =
  'An unexpected error occurred during the release process.'

/**
 * Release plan entry contained in a generated release report.
 */
export type ReportPlan = ReleaseReport['plans'][number]

/**
 * Format a package location as a repository-relative directory path.
 *
 * @param location Package directory location
 * @returns Normalized directory path
 */
export function formatPackageDirectory(location: string): string {
  const dir = path.normalize(path.join(location, '.'))

  return dir === '.' ? dir : `./${dir}`
}

/**
 * Compare release plans by package name for display ordering.
 *
 * @param a First release plan
 * @param b Second release plan
 * @returns Comparison result for sorting
 */
export function comparePlansByName(a: ReportPlan, b: ReportPlan): number {
  return (a.package.name || '').localeCompare(b.package.name || '')
}
