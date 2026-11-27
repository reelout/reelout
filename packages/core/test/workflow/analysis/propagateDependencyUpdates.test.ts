// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { GitCommit, ReleasePlan } from '@reelout/core'
import { propagateDependencyUpdates } from '@reelout/core'
import { expect, test, vi } from 'vitest'
import { context } from '../../../../../test/mock/context'
import { createMockCommit } from '../../../../../test/mock/git'

const mergeGitHistory = vi.hoisted(() =>
  vi.fn().mockImplementation((cwd: string, a: GitCommit[], b: GitCommit[]) => {
    return a
      .concat(b)
      .filter(
        ({ hash }, index, array) =>
          array.findIndex((commit) => commit.hash === hash) === index
      )
      .sort((a, b) => a.hash.localeCompare(b.hash))
      .reverse()
  })
)

vi.mock(import('@reelout/core/git/history/mergeGitHistory'), () => ({
  mergeGitHistory,
}))

async function getPropagatedPlans(
  ...args: Parameters<typeof propagateDependencyUpdates>
) {
  return (await propagateDependencyUpdates(...args)).map((plan) => ({
    name: plan.package.name,
    type: plan.release?.type,
    history: plan.history.map((commit) => commit.hash),
  }))
}

test('propagates patch release to dependents', async () => {
  const plans = [
    {
      package: { name: 'a', dependencies: [] as string[] },
      history: [await createMockCommit('c1', 'feat: add something')],
      release: { type: 'minor' },
    },
    {
      package: { name: 'b', dependencies: ['d'] },
      history: [],
      release: null,
    },
    {
      package: { name: 'c', dependencies: ['a', 'b'] },
      history: [],
      release: null,
    },
    {
      package: { name: 'd', dependencies: ['c'] },
      history: [],
      release: null,
    },
  ] as ReleasePlan[]

  expect(await getPropagatedPlans(context.cwd, plans)).toMatchInlineSnapshot(`
    [
      {
        "history": [
          "c1",
        ],
        "name": "a",
        "type": "minor",
      },
      {
        "history": [
          "c1",
        ],
        "name": "b",
        "type": "patch",
      },
      {
        "history": [
          "c1",
        ],
        "name": "c",
        "type": "patch",
      },
      {
        "history": [
          "c1",
        ],
        "name": "d",
        "type": "patch",
      },
    ]
  `)
})

test('propagates patch releases even with missing package names', async () => {
  const plans = [
    {
      package: { name: undefined, dependencies: ['a', 'c'] },
      history: [],
      release: null,
    },
    {
      package: { name: 'a', dependencies: ['b', 'c'] },
      history: [],
      release: null,
    },
    {
      package: { name: 'b', dependencies: ['a'] },
      history: [await createMockCommit('c1', 'feat: add something')],
      release: { type: 'major' },
    },
    {
      package: { name: 'c', dependencies: [] },
      history: [await createMockCommit('c1', 'feat: add something')],
      release: { type: 'minor' },
    },
    {
      package: { name: 'd', dependencies: [] },
      history: [await createMockCommit('c2', 'feat: add something')],
      release: { type: 'minor' },
    },
    {
      package: { name: 'e', dependencies: [] },
      history: [],
      release: { type: 'unknown' },
    },
    {
      package: { name: '', dependencies: ['a', 'd'] },
      history: [],
      release: null,
    },
  ] as ReleasePlan[]

  expect(await getPropagatedPlans(context.cwd, plans)).toMatchInlineSnapshot(`
    [
      {
        "history": [
          "c1",
        ],
        "name": undefined,
        "type": "patch",
      },
      {
        "history": [
          "c1",
        ],
        "name": "a",
        "type": "patch",
      },
      {
        "history": [
          "c1",
        ],
        "name": "b",
        "type": "major",
      },
      {
        "history": [
          "c1",
        ],
        "name": "c",
        "type": "minor",
      },
      {
        "history": [
          "c2",
        ],
        "name": "d",
        "type": "minor",
      },
      {
        "history": [],
        "name": "e",
        "type": "unknown",
      },
      {
        "history": [
          "c2",
          "c1",
        ],
        "name": "",
        "type": "patch",
      },
    ]
  `)
})
