// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { CommitClassifier, GitCommit } from '@reelout/core'
import { normalizeReleaseType, normalizeCommitFilter } from '@reelout/core'
import { expect, test } from 'vitest'

const classifier = normalizeCommitFilter({})

const breakingCommit = {
  notes: [{ title: 'BREAKING CHANGE', text: '' }],
} as GitCommit

test('returns major for breaking changes', () => {
  expect(normalizeReleaseType(classifier, breakingCommit)).toBe('major')
})

test('returns minor for breaking changes while version is zero-major', () => {
  expect(normalizeReleaseType(classifier, breakingCommit, '0.3.0')).toBe(
    'minor'
  )
  expect(normalizeReleaseType(classifier, breakingCommit, '0.3.1')).toBe(
    'minor'
  )
  expect(normalizeReleaseType(classifier, breakingCommit, '0.0.3')).toBe(
    'minor'
  )
  expect(
    normalizeReleaseType(classifier, breakingCommit, '0.3.0-alpha.1')
  ).toBe('minor')
})

test('returns major for breaking changes when version has a non-zero major', () => {
  expect(normalizeReleaseType(classifier, breakingCommit, '1.0.0')).toBe(
    'major'
  )
  expect(normalizeReleaseType(classifier, breakingCommit, '1.2.3')).toBe(
    'major'
  )
  expect(
    normalizeReleaseType(classifier, breakingCommit, '1.0.0-alpha.1')
  ).toBe('major')
})

test('returns major for breaking changes when version is null or invalid', () => {
  expect(normalizeReleaseType(classifier, breakingCommit, null)).toBe('major')
  expect(
    normalizeReleaseType(classifier, breakingCommit, 'not-a-version')
  ).toBe('major')
})

test('keeps classifier-derived major on zero-major versions', () => {
  const majorClassifier = normalizeCommitFilter({ major: ['perf'] })

  const commit = { type: 'perf' } as GitCommit

  expect(
    normalizeReleaseType(majorClassifier, { ...commit, notes: [] }, '0.3.0')
  ).toBe('major')
})

test('returns release type based on commit type and config', () => {
  const customClassifier: CommitClassifier = (commit) => {
    switch (commit.type) {
      case 'perf':
        return 'major'
      case 'feat':
        return 'minor'
      case 'fix':
        return 'patch'
      case 'chore':
        return commit.scope === 'release' ? 'patch' : null
      default:
        return null
    }
  }

  for (const [releaseType, commit] of [
    ['minor', { type: 'feat' } as GitCommit],
    ['patch', { type: 'fix' } as GitCommit],
    ['major', { type: 'perf' } as GitCommit],
    [null, { type: 'chore' } as GitCommit],
    [null, { type: 'chore', scope: 'deps' } as GitCommit],
    ['patch', { type: 'chore', scope: 'release' } as GitCommit],
    [null, { type: null, scope: null } as GitCommit],
    [null, { type: 'docs', scope: 'release' } as GitCommit],
  ] as const) {
    expect(
      normalizeReleaseType(customClassifier, { ...commit, notes: [] })
    ).toBe(releaseType)
  }
})

test('ignores version for non-breaking commits', () => {
  const featClassifier = normalizeCommitFilter({ minor: ['feat'] })

  const commit = { type: 'feat' } as GitCommit

  expect(
    normalizeReleaseType(featClassifier, { ...commit, notes: [] }, '0.3.0')
  ).toBe('minor')
  expect(
    normalizeReleaseType(featClassifier, { ...commit, notes: [] }, '1.2.3')
  ).toBe('minor')
})
