// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { Package, Workspace } from '@reelout/core'
import { buildPackageFilePattern } from '@reelout/npm'
import path from 'node:path'
import { beforeEach, expect, test } from 'vitest'

let workspace: Workspace

beforeEach(() => {
  workspace = { entry: '.', members: null }
})

test('returns default pattern for root', () => {
  const info = { location: '.', root: true } as Package
  const files = buildPackageFilePattern({
    workspace,
    root: info.root,
    dir: info.location,
    packageManager: 'npm',
  })

  expect(files).toBe('**/*')
})

test('returns workspace pattern when configured', () => {
  workspace.entry = '.'
  workspace.members = ['packages/*', 'docs']

  const info = { location: '.', root: true } as Package
  const files = buildPackageFilePattern({
    workspace,
    root: info.root,
    dir: info.location,
    packageManager: 'npm',
  })

  expect(files).toBe(
    `!{package-lock.json,npm-shrinkwrap.json,pnpm-lock.yaml,yarn.lock,packages/*/**/*,docs/**/*}`
  )
})

test('returns package-specific pattern', () => {
  workspace.entry = '.'
  workspace.members = ['packages/*']

  const dir = path.join('packages', 'foo')
  const info = { location: dir, root: false } as Package
  const files = buildPackageFilePattern({
    workspace,
    root: info.root,
    dir: info.location,
    packageManager: 'npm',
  })

  expect(files).toBe('packages/foo/**/*')
})

test('includes the pnpm workspace manifest in member patterns when managed by pnpm', () => {
  workspace.entry = '.'
  workspace.members = ['packages/*']

  const files = buildPackageFilePattern({
    workspace,
    root: false,
    dir: 'packages/foo',
    packageManager: 'pnpm',
  })

  expect(files).toEqual(['packages/foo/**/*', 'pnpm-workspace.yaml'])
})

test('keeps member patterns unchanged for other package managers', () => {
  workspace.entry = '.'
  workspace.members = ['packages/*']

  for (const packageManager of ['npm', 'yarn'] as const) {
    expect(
      buildPackageFilePattern({
        workspace,
        root: false,
        dir: 'packages/foo',
        packageManager,
      })
    ).toBe('packages/foo/**/*')
  }
})

test('ignores the package manager for workspace root patterns', () => {
  workspace.entry = '.'
  workspace.members = ['packages/*']

  const files = buildPackageFilePattern({
    workspace,
    root: true,
    dir: '.',
    packageManager: 'pnpm',
  })

  expect(files).toBe(
    '!{package-lock.json,npm-shrinkwrap.json,pnpm-lock.yaml,yarn.lock,packages/*/**/*}'
  )
})
