// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { generateReleaseReport, type ReleasePlan } from '@reelout/core'
import { expect, test } from 'vitest'
import { context } from '../../../../../test/mock/context'

test('constructs structured package and release objects when release plans are present', () => {
  context.plans = [
    {
      package: {
        root: true,
        entry: true,
        location: '.',
        name: '',
        version: '3.0.0',
        private: false,
      },
      release: {
        type: 'major',
        version: '4.0.0',
        changelog: [
          '## 4.0.0',
          '',
          '### Breaking Changes',
          '',
          '- Require Node.js 24+',
          '',
        ].join('\n'),
      },
    },
    {
      package: {
        location: 'packages/foo',
        name: 'foo',
        version: '1.0.0',
      },
      release: {
        type: 'minor',
        version: '1.1.0',
        changelog: [
          '## 1.1.0',
          '',
          '### Features',
          '',
          '- Introduce new feature',
          '',
        ].join('\n'),
      },
    },
    {
      package: {
        location: 'packages/bar',
        name: '',
        version: '2.0.0',
        private: true,
      },
      release: {
        type: 'patch',
        version: '2.0.1',
        changelog: [
          '## 2.0.1',
          '',
          '### Bug Fixes',
          '',
          '- Fix critical bug',
          '',
        ].join('\n'),
      },
    },
    {
      package: {
        location: 'packages/baz',
        name: 'baz',
        version: '2.0.0',
      },
      release: {
        type: 'major',
        version: '3.0.0',
        changelog: [
          '## 3.0.0',
          '',
          '### Breaking Changes',
          '',
          '- Major update',
          '',
        ].join('\n'),
      },
    },
    {
      package: {
        entry: true,
        location: 'packages/qux',
        version: '1.0.0',
      },
      release: {
        type: 'minor',
        version: '1.1.0',
        changelog: [
          '## 1.1.0',
          '',
          '### Features',
          '',
          '- Introduce new feature',
          '',
        ].join('\n'),
      },
    },
  ] as ReleasePlan[]

  const report = generateReleaseReport(context)

  expect(report).toMatchInlineSnapshot(`
    {
      "outcome": null,
      "packages": [],
      "plans": [
        {
          "package": {
            "entry": true,
            "location": ".",
            "name": "",
            "private": false,
            "provider": undefined,
            "version": "3.0.0",
          },
          "release": {
            "changelog": "## 4.0.0

    ### Breaking Changes

    - Require Node.js 24+
    ",
            "tag": undefined,
            "type": "major",
            "version": "4.0.0",
          },
        },
        {
          "package": {
            "entry": undefined,
            "location": "packages/foo",
            "name": "foo",
            "private": false,
            "provider": undefined,
            "version": "1.0.0",
          },
          "release": {
            "changelog": "## 1.1.0

    ### Features

    - Introduce new feature
    ",
            "tag": undefined,
            "type": "minor",
            "version": "1.1.0",
          },
        },
        {
          "package": {
            "entry": undefined,
            "location": "packages/bar",
            "name": "",
            "private": true,
            "provider": undefined,
            "version": "2.0.0",
          },
          "release": {
            "changelog": "## 2.0.1

    ### Bug Fixes

    - Fix critical bug
    ",
            "tag": undefined,
            "type": "patch",
            "version": "2.0.1",
          },
        },
        {
          "package": {
            "entry": undefined,
            "location": "packages/baz",
            "name": "baz",
            "private": false,
            "provider": undefined,
            "version": "2.0.0",
          },
          "release": {
            "changelog": "## 3.0.0

    ### Breaking Changes

    - Major update
    ",
            "tag": undefined,
            "type": "major",
            "version": "3.0.0",
          },
        },
        {
          "package": {
            "entry": true,
            "location": "packages/qux",
            "name": undefined,
            "private": false,
            "provider": undefined,
            "version": "1.0.0",
          },
          "release": {
            "changelog": "## 1.1.0

    ### Features

    - Introduce new feature
    ",
            "tag": undefined,
            "type": "minor",
            "version": "1.1.0",
          },
        },
      ],
    }
  `)
})

test('omits versionQualifier and releaseChannel from the report when set in the context', () => {
  context.versionQualifier = 'dev'
  context.releaseChannel = 'next'

  const report = generateReleaseReport(context)

  expect(report).toMatchInlineSnapshot(`
    {
      "outcome": null,
      "packages": [],
      "plans": [],
    }
  `)
})

test('omits release plan from report when release version is null or missing', () => {
  context.plans = [
    { package: { name: 'foo', version: '1.0.0' }, release: null },
    { package: { name: 'bar', version: '2.0.0' }, release: null },
  ] as ReleasePlan[]

  const report = generateReleaseReport(context)

  expect(report).toMatchInlineSnapshot(`
    {
      "outcome": null,
      "packages": [],
      "plans": [],
    }
  `)
})

test('carries the raw release outcome in the report when the workflow failed', () => {
  context.plans = [
    { package: { name: 'foo', version: '1.0.0' }, release: null },
    { package: { name: 'bar', version: '2.0.0' }, release: null },
  ] as ReleasePlan[]

  context.outcome = {
    status: 'failure',
    error: new Error('Something went wrong'),
    phase: { hook: 'write', plugin: 'npm' },
  }

  let report = generateReleaseReport(context)

  expect(report).toMatchInlineSnapshot(`
    {
      "outcome": {
        "error": [Error: Something went wrong],
        "phase": {
          "hook": "write",
          "plugin": "npm",
        },
        "status": "failure",
      },
      "packages": [],
      "plans": [],
    }
  `)

  context.outcome = {
    status: 'failure',
    error: 'Nothing went wrong, actually',
    phase: null,
  }

  report = generateReleaseReport(context)

  expect(report).toMatchInlineSnapshot(`
    {
      "outcome": {
        "error": "Nothing went wrong, actually",
        "phase": null,
        "status": "failure",
      },
      "packages": [],
      "plans": [],
    }
  `)
})
