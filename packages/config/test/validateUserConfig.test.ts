// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { validateUserConfig } from '@reelout/config'
import { expect, test } from 'vitest'

const filepath = '/project/.reeloutrc.json'

test('accepts absent configurations', () => {
  expect(() => validateUserConfig(undefined, filepath)).not.toThrow()
  expect(() => validateUserConfig(null, filepath)).not.toThrow()
  expect(() => validateUserConfig({}, filepath)).not.toThrow()
})

test('accepts a configuration with valid shapes', () => {
  expect(() =>
    validateUserConfig(
      {
        author: { name: 'Release Bot', email: 'release@example.com' },
        classifier: { major: ['feat'], minor: [], patch: ['fix'] },
        rules: [],
        plugins: [],
      },
      filepath
    )
  ).not.toThrow()
})

test('accepts a classifier function and null author fields', () => {
  expect(() =>
    validateUserConfig({ classifier: () => 'patch' }, filepath)
  ).not.toThrow()

  expect(() =>
    validateUserConfig({ author: { name: null, email: null } }, filepath)
  ).not.toThrow()
})

test('rejects a configuration that is not an object', () => {
  expect(() => validateUserConfig('release', filepath)).toThrowError(
    'Configuration file "/project/.reeloutrc.json" contains an invalid "configuration" value: expected an object, received string.'
  )

  expect(() => validateUserConfig([], filepath)).toThrowError(
    'Configuration file "/project/.reeloutrc.json" contains an invalid "configuration" value: expected an object, received array.'
  )
})

test('rejects an author that is not an object', () => {
  expect(() => validateUserConfig({ author: 'bob' }, filepath)).toThrowError(
    'Configuration file "/project/.reeloutrc.json" contains an invalid "author" value: expected an object, received string.'
  )

  expect(() => validateUserConfig({ author: [] }, filepath)).toThrowError(
    'Configuration file "/project/.reeloutrc.json" contains an invalid "author" value: expected an object, received array.'
  )
})

test('rejects author name and email values that are not strings', () => {
  expect(() =>
    validateUserConfig({ author: { name: 42 } }, filepath)
  ).toThrowError(
    'Configuration file "/project/.reeloutrc.json" contains an invalid "author.name" value: expected a string, received number.'
  )

  expect(() =>
    validateUserConfig({ author: { email: false } }, filepath)
  ).toThrowError(
    'Configuration file "/project/.reeloutrc.json" contains an invalid "author.email" value: expected a string, received boolean.'
  )
})

test('rejects a classifier that is neither an object nor a function', () => {
  expect(() =>
    validateUserConfig({ classifier: 'conventional' }, filepath)
  ).toThrowError(
    'Configuration file "/project/.reeloutrc.json" contains an invalid "classifier" value: expected an object or function, received string.'
  )

  expect(() => validateUserConfig({ classifier: null }, filepath)).toThrowError(
    'Configuration file "/project/.reeloutrc.json" contains an invalid "classifier" value: expected an object or function, received null.'
  )
})

test('rejects classifier entries that are not arrays', () => {
  expect(() =>
    validateUserConfig({ classifier: { major: 'feat' } }, filepath)
  ).toThrowError(
    'Configuration file "/project/.reeloutrc.json" contains an invalid "classifier.major" value: expected an array, received string.'
  )
})

test('rejects rules and plugins that are not arrays', () => {
  expect(() => validateUserConfig({ rules: 'main' }, filepath)).toThrowError(
    'Configuration file "/project/.reeloutrc.json" contains an invalid "rules" value: expected an array, received string.'
  )

  expect(() => validateUserConfig({ rules: null }, filepath)).toThrowError(
    'Configuration file "/project/.reeloutrc.json" contains an invalid "rules" value: expected an array, received null.'
  )

  expect(() => validateUserConfig({ plugins: {} }, filepath)).toThrowError(
    'Configuration file "/project/.reeloutrc.json" contains an invalid "plugins" value: expected an array, received object.'
  )
})
