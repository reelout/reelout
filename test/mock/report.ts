// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { ReleaseOutcome, ReleaseReport } from '@reelout/core'

export const createOutcome = (
  outcome: Partial<ReleaseOutcome> = {}
): ReleaseOutcome => ({
  status: 'success',
  error: null,
  phase: null,
  ...outcome,
})

export const createReport = (
  report: Partial<ReleaseReport>
): ReleaseReport => ({
  dryRun: false,
  outcome: null,
  skipped: [],
  packages: [],
  plans: [],
  ...report,
})
