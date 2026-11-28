// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { isCredentialsRejected } from '@reelout/npm'
import { expect, test } from 'vitest'

test('matches the E401 registry error code', () => {
  expect(isCredentialsRejected(new Error('npm error code E401'))).toBe(true)
})

test('matches the ENEEDAUTH registry error code', () => {
  expect(isCredentialsRejected(new Error('ENEEDAUTH auth required'))).toBe(true)
})

test('matches the 401 Unauthorized rejection phrase', () => {
  expect(
    isCredentialsRejected(new Error('401 Unauthorized: invalid auth token'))
  ).toBe(true)
})

test('matches the Response Code: 401 rejection phrase', () => {
  expect(isCredentialsRejected(new Error('Response Code: 401'))).toBe(true)
})

test('matches the Unable to authenticate rejection phrase', () => {
  expect(
    isCredentialsRejected(
      new Error(
        'Unable to authenticate, your authentication token seems invalid.'
      )
    )
  ).toBe(true)
})

test('matches the not logged in rejection phrase', () => {
  expect(isCredentialsRejected(new Error('You are not logged in.'))).toBe(true)
})

test('matches the pnpm whoami unauthorized error code', () => {
  expect(
    isCredentialsRejected(
      new Error('ERR_PNPM_WHOAMI_UNAUTHORIZED 401 Unauthorized')
    )
  ).toBe(true)
})

test('matches the pnpm whoami failed error code', () => {
  expect(isCredentialsRejected(new Error('ERR_PNPM_WHOAMI_FAILED'))).toBe(true)
})

test('matches a rejection carried as a plain string', () => {
  expect(isCredentialsRejected('401 Unauthorized')).toBe(true)
})

test('ignores unreachable registry errors', () => {
  expect(
    isCredentialsRejected(new Error('getaddrinfo ENOTFOUND registry.npmjs.org'))
  ).toBe(false)
})

test('ignores not-found registry errors', () => {
  expect(isCredentialsRejected(new Error('Response Code: 404'))).toBe(false)
})

test('ignores request timeout errors', () => {
  expect(isCredentialsRejected(new Error('request timed out: ETIMEDOUT'))).toBe(
    false
  )
})
