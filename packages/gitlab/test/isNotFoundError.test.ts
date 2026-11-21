// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { isNotFoundError } from '@reelout/gitlab/isNotFoundError'
import { expect, test } from 'vitest'

test('matches GitBeaker 404 responses', () => {
  const notFound = Object.assign(new Error('404 Release not found'), {
    cause: { response: { status: 404 } },
  })

  expect(isNotFoundError(notFound)).toBe(true)
})

test('ignores other response statuses', () => {
  const serverError = Object.assign(new Error('500 Internal Server Error'), {
    cause: { response: { status: 500 } },
  })

  expect(isNotFoundError(serverError)).toBe(false)
})

test('ignores errors without a 404 response status', () => {
  expect(
    isNotFoundError(
      Object.assign(new Error('no response'), { cause: { response: {} } })
    )
  ).toBe(false)
  expect(
    isNotFoundError(Object.assign(new Error('no status'), { cause: {} }))
  ).toBe(false)
  expect(isNotFoundError(new Error('no cause'))).toBe(false)
  expect(isNotFoundError('not an error')).toBe(false)
})
