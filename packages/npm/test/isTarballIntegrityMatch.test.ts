// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { createHash } from 'node:crypto'
import { isTarballIntegrityMatch } from '@reelout/npm'
import { expect, test } from 'vitest'

const tarball = Buffer.from('packed-tarball')

const integrityOf = (algorithm: string, content: Buffer): string =>
  `${algorithm}-${createHash(algorithm).update(content).digest('base64')}`

test('matches a tarball against its sha512 integrity value', () => {
  expect(isTarballIntegrityMatch(tarball, integrityOf('sha512', tarball))).toBe(
    true
  )
})

test('supports the legacy sha1 integrity algorithm', () => {
  expect(isTarballIntegrityMatch(tarball, integrityOf('sha1', tarball))).toBe(
    true
  )
})

test('does not match a tarball against a digest of different content', () => {
  expect(
    isTarballIntegrityMatch(
      tarball,
      integrityOf('sha512', Buffer.from('other-tarball'))
    )
  ).toBe(false)
})

test('does not match integrity values without a digest separator', () => {
  expect(isTarballIntegrityMatch(tarball, '')).toBe(false)
  expect(isTarballIntegrityMatch(tarball, 'sha512')).toBe(false)
})

test('does not match integrity values without an algorithm', () => {
  expect(isTarballIntegrityMatch(tarball, '-digest')).toBe(false)
})

test('does not match integrity values with an unsupported algorithm', () => {
  expect(isTarballIntegrityMatch(tarball, 'not-a-hash-digest')).toBe(false)
})
