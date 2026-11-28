// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { getRegistryCredentialAliases, normalizeRegistry } from '@reelout/npm'
import { expect, test } from 'vitest'

test('returns undefined for null, undefined, or empty string', () => {
  expect(normalizeRegistry(null)).toBeUndefined()
  expect(normalizeRegistry(undefined)).toBeUndefined()
  expect(normalizeRegistry('')).toBeUndefined()
})

test('normalizes a valid URL string to its href representation', () => {
  expect(normalizeRegistry('https://registry.npmjs.org')).toBe(
    'https://registry.npmjs.org/'
  )
  expect(normalizeRegistry('http://localhost:4873/path')).toBe(
    'http://localhost:4873/path'
  )
})

test('returns undefined for invalid URL strings', () => {
  expect(normalizeRegistry('not-a-valid-url')).toBeUndefined()
  expect(normalizeRegistry('://missing-scheme')).toBeUndefined()
})

test('strips embedded credentials from registry URLs', () => {
  expect(normalizeRegistry('https://user:pass@registry.example.com')).toBe(
    'https://registry.example.com/'
  )
  expect(normalizeRegistry('https://user@registry.example.com/path/')).toBe(
    'https://registry.example.com/path/'
  )
  expect(normalizeRegistry('http://user:pass@localhost:4873')).toBe(
    'http://localhost:4873/'
  )
})

test('aliases registry.yarnpkg.com to registry.npmjs.org for credential lookups', () => {
  expect(getRegistryCredentialAliases('https://registry.yarnpkg.com/')).toEqual(
    ['https://registry.yarnpkg.com/', 'https://registry.npmjs.org/']
  )
})

test('aliases registry.npmjs.org to registry.yarnpkg.com for credential lookups', () => {
  expect(getRegistryCredentialAliases('https://registry.npmjs.org/')).toEqual([
    'https://registry.npmjs.org/',
    'https://registry.yarnpkg.com/',
  ])
})

test('leaves other registries without credential aliases', () => {
  expect(getRegistryCredentialAliases('https://npm.example.com/')).toEqual([
    'https://npm.example.com/',
  ])
})

test('returns the input registry when it cannot be parsed', () => {
  expect(getRegistryCredentialAliases('not-a-registry-url')).toEqual([
    'not-a-registry-url',
  ])
})
