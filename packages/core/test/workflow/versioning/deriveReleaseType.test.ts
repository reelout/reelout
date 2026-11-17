// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { GitCommit, GitCommitNote } from '@reelout/core'
import { deriveReleaseType, normalizeCommitFilter } from '@reelout/core'
import { expect, test } from 'vitest'

const classifier = normalizeCommitFilter({
  minor: ['feat'],
  patch: ['fix'],
})

test('ignores unrecognized commit types', () => {
  expect(deriveReleaseType(classifier, [])).toBeNull()

  expect(
    deriveReleaseType(classifier, [
      { type: 'chore', notes: [] as GitCommitNote[] },
      { type: 'docs', notes: [] as GitCommitNote[] },
    ] as GitCommit[])
  ).toBeNull()
})

test('returns most significant release type', () => {
  expect(
    deriveReleaseType(classifier, [
      { type: 'fix', notes: [] as GitCommitNote[] },
      { type: 'feat', notes: [] as GitCommitNote[] },
    ] as GitCommit[])
  ).toBe('minor')
})

test('returns major for breaking changes regardless of commit type', () => {
  expect(
    deriveReleaseType(classifier, [
      { type: 'feat', notes: [] as GitCommitNote[] },
      { notes: [{ title: 'BREAKING CHANGE', text: '' }] as GitCommitNote[] },
      { type: 'fix', notes: [] as GitCommitNote[] },
    ] as GitCommit[])
  ).toBe('major')
})

test('downgrades major to minor while version is zero-major', () => {
  const history = [
    { type: 'refactor', notes: [] as GitCommitNote[] },
    {
      notes: [{ title: 'BREAKING CHANGE', text: '' }] as GitCommitNote[],
    },
  ] as GitCommit[]

  expect(deriveReleaseType(classifier, history, '0.3.0')).toBe('minor')
  expect(deriveReleaseType(classifier, history, '0.3.1')).toBe('minor')
  expect(deriveReleaseType(classifier, history, '0.0.3')).toBe('minor')
  expect(deriveReleaseType(classifier, history, '0.3.0-alpha.1')).toBe('minor')
})

test('keeps major for breaking changes when version is at or above 1.0.0', () => {
  const history = [
    { type: 'refactor', notes: [] as GitCommitNote[] },
    {
      notes: [{ title: 'BREAKING CHANGE', text: '' }] as GitCommitNote[],
    },
  ] as GitCommit[]

  expect(deriveReleaseType(classifier, history, '1.0.0')).toBe('major')
  expect(deriveReleaseType(classifier, history, '1.2.3')).toBe('major')
  expect(deriveReleaseType(classifier, history, '1.0.0-alpha.1')).toBe('major')
})

test('keeps major for breaking changes when version is missing or invalid', () => {
  const history = [
    { type: 'refactor', notes: [] as GitCommitNote[] },
    {
      notes: [{ title: 'BREAKING CHANGE', text: '' }] as GitCommitNote[],
    },
  ] as GitCommit[]

  expect(deriveReleaseType(classifier, history)).toBe('major')
  expect(deriveReleaseType(classifier, history, null)).toBe('major')
  expect(deriveReleaseType(classifier, history, 'not-a-version')).toBe('major')
})

test('preserves minor and patch release types on zero-major versions', () => {
  expect(
    deriveReleaseType(
      classifier,
      [{ type: 'feat', notes: [] as GitCommitNote[] }] as GitCommit[],
      '0.3.0'
    )
  ).toBe('minor')

  expect(
    deriveReleaseType(
      classifier,
      [{ type: 'fix', notes: [] as GitCommitNote[] }] as GitCommit[],
      '0.3.0'
    )
  ).toBe('patch')
})
