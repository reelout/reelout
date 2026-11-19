// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { ReleaseReport } from '@reelout/core'

export const createReport = (
  report: Partial<ReleaseReport>
): ReleaseReport => ({
  outcome: null,
  packages: [],
  plans: [],
  ...report,
})
