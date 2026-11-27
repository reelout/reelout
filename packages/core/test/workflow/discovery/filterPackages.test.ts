// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { type Package, filterPackages } from '@reelout/core'
import { expect, test } from 'vitest'

function getPackage(overrides: Partial<Package>): Package {
  return {
    provider: undefined,
    name: 'pkg',
    version: '1.0.0',
    private: undefined,
    root: false,
    entry: false,
    dependencies: [],
    location: 'pkg',
    files: undefined,
    tag: null,
    ...overrides,
  }
}

function getPackageNames(packages: Package[]) {
  return packages.map((pkg) => pkg.name)
}

test('returns a shallow copy of every package when patterns is empty', () => {
  const packages = [
    getPackage({ name: 'pkg-a', location: 'a' }),
    getPackage({ name: 'pkg-b', location: 'b' }),
  ]

  const filtered = filterPackages(packages, [])

  expect(getPackageNames(filtered)).toEqual(['pkg-a', 'pkg-b'])
  expect(filtered).not.toBe(packages)
})

test('keeps only packages whose names match the patterns', () => {
  const packages = [
    getPackage({ name: 'pkg-a', location: 'a' }),
    getPackage({ name: 'other-b', location: 'b' }),
    getPackage({ name: '@scope/pkg-c', location: 'c' }),
  ]

  expect(getPackageNames(filterPackages(packages, ['pkg-*']))).toEqual([
    'pkg-a',
  ])
  expect(
    getPackageNames(filterPackages(packages, ['pkg-a', 'other-b']))
  ).toEqual(['pkg-a', 'other-b'])
  expect(getPackageNames(filterPackages(packages, ['@scope/*']))).toEqual([
    '@scope/pkg-c',
  ])
})

test('keeps every package except the negated ones when all patterns are negated', () => {
  const packages = [
    getPackage({ name: 'pkg-a', location: 'a' }),
    getPackage({ name: 'pkg-b', location: 'b' }),
  ]

  expect(getPackageNames(filterPackages(packages, ['!pkg-b']))).toEqual([
    'pkg-a',
  ])
})

test('falls back to an empty string for unnamed packages that only globstar matches', () => {
  const packages = [
    getPackage({ name: 'pkg-a', location: 'a' }),
    getPackage({ name: undefined, location: 'b' }),
  ]

  expect(getPackageNames(filterPackages(packages, ['*']))).toEqual(['pkg-a'])
  expect(getPackageNames(filterPackages(packages, ['**']))).toEqual([
    'pkg-a',
    undefined,
  ])
})
