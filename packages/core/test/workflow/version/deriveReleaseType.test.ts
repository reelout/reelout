// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { GitCommit, GitCommitNote, ReleasePlan } from '@reelout/core'
import { deriveReleaseType, normalizeCommitFilter } from '@reelout/core'
import { expect, test } from 'vitest'

const classifier = normalizeCommitFilter({
  minor: ['feat'],
  patch: ['fix'],
})

function createReleasePlan(
  version: string,
  history: GitCommit[]
): Pick<ReleasePlan, 'history' | 'package'> {
  return {
    history,
    package: {
      name: undefined,
      version,
      root: false,
      entry: false,
      dependencies: [],
      location: '/tmp/demo',
    },
  }
}

const breakingHistory = [
  { type: 'refactor', notes: [] as GitCommitNote[] },
  { notes: [{ title: 'BREAKING CHANGE', text: '' }] as GitCommitNote[] },
] as GitCommit[]

test('ignores unrecognized commit types', () => {
  expect(
    deriveReleaseType(classifier, createReleasePlan('1.2.3', []))
  ).toBeNull()

  expect(
    deriveReleaseType(
      classifier,
      createReleasePlan('1.2.3', [
        { type: 'chore', notes: [] as GitCommitNote[] },
        { type: 'docs', notes: [] as GitCommitNote[] },
      ] as GitCommit[])
    )
  ).toBeNull()
})

test('returns most significant release type', () => {
  expect(
    deriveReleaseType(
      classifier,
      createReleasePlan('1.2.3', [
        { type: 'fix', notes: [] as GitCommitNote[] },
        { type: 'feat', notes: [] as GitCommitNote[] },
      ] as GitCommit[])
    )
  ).toBe('minor')
})

test('returns major for breaking changes regardless of commit type', () => {
  expect(
    deriveReleaseType(
      classifier,
      createReleasePlan('1.2.3', [
        { type: 'feat', notes: [] as GitCommitNote[] },
        { notes: [{ title: 'BREAKING CHANGE', text: '' }] as GitCommitNote[] },
        { type: 'fix', notes: [] as GitCommitNote[] },
      ] as GitCommit[])
    )
  ).toBe('major')
})

test('downgrades major to minor while version is zero-major', () => {
  expect(
    deriveReleaseType(classifier, createReleasePlan('0.3.0', breakingHistory))
  ).toBe('minor')
  expect(
    deriveReleaseType(classifier, createReleasePlan('0.3.1', breakingHistory))
  ).toBe('minor')
  expect(
    deriveReleaseType(classifier, createReleasePlan('0.0.3', breakingHistory))
  ).toBe('minor')
  expect(
    deriveReleaseType(
      classifier,
      createReleasePlan('0.3.0-alpha.1', breakingHistory)
    )
  ).toBe('minor')
})

test('keeps major for breaking changes when version has a non-zero major', () => {
  expect(
    deriveReleaseType(classifier, createReleasePlan('1.0.0', breakingHistory))
  ).toBe('major')
  expect(
    deriveReleaseType(classifier, createReleasePlan('1.2.3', breakingHistory))
  ).toBe('major')
  expect(
    deriveReleaseType(
      classifier,
      createReleasePlan('1.0.0-alpha.1', breakingHistory)
    )
  ).toBe('major')
})

test('keeps major for breaking changes when version is invalid', () => {
  expect(
    deriveReleaseType(
      classifier,
      createReleasePlan('not-a-version', breakingHistory)
    )
  ).toBe('major')

  expect(
    deriveReleaseType(classifier, createReleasePlan('', breakingHistory))
  ).toBe('major')
})

test('preserves minor and patch release types on zero-major versions', () => {
  expect(
    deriveReleaseType(
      classifier,
      createReleasePlan('0.3.0', [
        { type: 'feat', notes: [] as GitCommitNote[] },
      ] as GitCommit[])
    )
  ).toBe('minor')

  expect(
    deriveReleaseType(
      classifier,
      createReleasePlan('0.3.0', [
        { type: 'fix', notes: [] as GitCommitNote[] },
      ] as GitCommit[])
    )
  ).toBe('patch')
})
