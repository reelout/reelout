// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { printReleaseReportAnnotation } from '@reelout/core'
import { expect, test, vi } from 'vitest'
import { createReport } from '../../../../../test/mock/report'

test('writes an error annotation with the escaped failure reason when the release fails on GitHub Actions', () => {
  using write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

  printReleaseReportAnnotation(
    { GITHUB_ACTIONS: 'true' },
    process.stdout,
    createReport({
      outcome: {
        status: 'failure',
        error: 'Publish failed: 100% of files\nNPM_TOKEN is required',
        phase: null,
      },
    })
  )

  expect(write.mock.calls).toEqual([
    [
      '::error title=Release failed::Publish failed: 100%25 of files%0ANPM_TOKEN is required\n',
    ],
  ])
})

test('falls back to the default failure message when the report has no error', () => {
  using write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

  printReleaseReportAnnotation(
    { GITHUB_ACTIONS: 'true' },
    process.stdout,
    createReport({ outcome: { status: 'failure', error: null, phase: null } })
  )

  expect(write.mock.calls).toEqual([
    [
      '::error title=Release failed::An unexpected error occurred during the release process.\n',
    ],
  ])
})

test('does not write an annotation when the release does not fail', () => {
  using write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

  printReleaseReportAnnotation(
    { GITHUB_ACTIONS: 'true' },
    process.stdout,
    createReport({ outcome: { status: 'success', error: null, phase: null } })
  )

  expect(write.mock.calls).toEqual([])
})

test('does not write an annotation when not running on GitHub Actions', () => {
  using write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

  printReleaseReportAnnotation(
    {},
    process.stdout,
    createReport({
      outcome: { status: 'failure', error: 'Publish failed', phase: null },
    })
  )

  expect(write.mock.calls).toEqual([])
})
