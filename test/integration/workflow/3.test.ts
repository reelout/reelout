// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import '../../mock/integration'

import { resolveConfig } from '@reelout/config'
import { createContext } from '@reelout/context'
import {
  compact,
  createPlugin,
  execGit,
  executeReleaseWorkflow,
  pushGitChanges,
  restoreFullGitHistory,
  verifyPackageTag,
  type ReleaseConfig,
} from '@reelout/core'
import { buildPackage, writePackageJson } from '@reelout/npm'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { temporaryDirectoryTask } from 'tempy'
import { expect, test, vi } from 'vitest'
import { createMockLogger, workspace } from '../../mock/context'
import {
  cloneGitRepository,
  getGitCommitSubjects,
  getGitTags,
  initializeGitRepository,
} from '../../mock/git'

async function executeWorkflowRun(cwd: string) {
  const logger = vi.fn()

  const config = await resolveConfig(cwd)

  const context = await createContext({
    ...config,
    cwd,
    env: process.env,
    stdout: process.stdout,
    stderr: process.stderr,
    logger: createMockLogger(logger),
  })

  await executeReleaseWorkflow(
    context,
    compact(await Promise.all(config.plugins.map(createPlugin)))
  )

  return logger
}

async function initializeDevRepository(remote: string) {
  await temporaryDirectoryTask(async (cwd) => {
    await initializeGitRepository(cwd, remote)
    await execGit(cwd, ['config', 'user.name', 'User One'])
    await execGit(cwd, ['config', 'user.email', 'user1@example.com'])

    await writePackageJson(cwd, { name: 'app', version: '1.2.0-dev.0' })
    await writeFile(
      path.join(cwd, '.reeloutrc.json'),
      JSON.stringify({
        rules: [{ pattern: 'main', qualifier: 'dev' }],
      } satisfies ReleaseConfig)
    )

    await execGit(cwd, ['add', '.'])
    await execGit(cwd, ['commit', '-m', 'chore: start 1.2.0 development'])
    await execGit(cwd, ['tag', 'v1.2.0-dev.0'])
    await pushGitChanges(cwd, 'main', 'v1.2.0-dev.0')
  })
}

async function stabilizeReleaseOnBranch(remote: string) {
  await temporaryDirectoryTask(async (cwd) => {
    await cloneGitRepository(cwd, remote)
    await execGit(cwd, ['config', 'user.name', 'User Two'])
    await execGit(cwd, ['config', 'user.email', 'user2@example.com'])

    await execGit(cwd, ['checkout', '-b', 'release/1.2.0'])

    await writeFile(path.join(cwd, 'index.js'), 'export const value = 1;')
    await execGit(cwd, ['add', '.'])
    await execGit(cwd, ['commit', '-m', 'fix: stabilize release candidate'])
    await pushGitChanges(cwd, 'release/1.2.0')
  })

  return await temporaryDirectoryTask(async (cwd) => {
    await cloneGitRepository(cwd, remote, 'release/1.2.0')

    return executeWorkflowRun(cwd)
  })
}

async function startNextDevCycleOnMain(remote: string) {
  await temporaryDirectoryTask(async (cwd) => {
    await cloneGitRepository(cwd, remote)
    await execGit(cwd, ['config', 'user.name', 'User Three'])
    await execGit(cwd, ['config', 'user.email', 'user3@example.com'])

    await writePackageJson(cwd, { name: 'app', version: '1.3.0-dev.0' })
    await execGit(cwd, ['add', '.'])
    await execGit(cwd, ['commit', '-m', 'chore: start 1.3.0 development'])
    await execGit(cwd, ['tag', 'v1.3.0-dev.0'])
    await pushGitChanges(cwd, 'main', 'v1.3.0-dev.0')
  })
}

async function commitFeatureToMainline(remote: string) {
  await temporaryDirectoryTask(async (cwd) => {
    await cloneGitRepository(cwd, remote)
    await execGit(cwd, ['config', 'user.name', 'User Four'])
    await execGit(cwd, ['config', 'user.email', 'user4@example.com'])

    await writeFile(path.join(cwd, 'index.js'), 'export const value = 2;')
    await execGit(cwd, ['add', '.'])
    await execGit(cwd, ['commit', '-m', 'feat: add next cycle feature'])
    await pushGitChanges(cwd, 'main')
  })
}

async function fetchReleaseBranch(cwd: string) {
  await restoreFullGitHistory(cwd)
  await execGit(cwd, [
    'fetch',
    'origin',
    'release/1.2.0:refs/remotes/origin/release/1.2.0',
  ])
}

// Topology: the release branch merges back into main as a fast-forward
// (main has no commits of its own past the branch point):
//
//   main          B0 -- C -- D -- X -- E -- (CI: release 1.3.0-dev.1)
//                       |_____|
//                       release/1.2.0 (branched from B0), fast-forward merged
//
//   B0  chore: start 1.2.0 development  (tag v1.2.0-dev.0)
//   C   fix: stabilize release candidate
//   D   chore: release 1.2.0             (tag v1.2.0)
//   X   chore: start 1.3.0 development  (tag v1.3.0-dev.0)
//   E   feat: add next cycle feature

test('continues the dev release channel after a fast-forward merge of a release branch into main', async () => {
  await temporaryDirectoryTask(async (remote) => {
    // User 1: Initialize the repository in the 1.2.0 development cycle
    await initializeDevRepository(remote)

    // CI workflow run on the release branch publishes the 1.2.0 stable release
    const branchLogger = await stabilizeReleaseOnBranch(remote)

    expect(branchLogger.mock.calls).toMatchInlineSnapshot(`
      [
        [
          "Active plugins: @reelout/core/analyzer, @reelout/core/builder, @reelout/core/changelog, @reelout/npm, @reelout/git, @reelout/github",
        ],
        [
          "Status: [32mSUCCESS[39m",
        ],
        [
          "Release complete: [1m[32m1 released[39m[22m [90m(1)[39m

      [44m app [49m[42m 1.2.0 ← 1.2.0-dev.0 [49m[90m patch [39m

      [36m## [1.2.0](https://github.com/mock-owner/mock-repo/compare/v1.2.0-dev.0...v1.2.0) (2026-01-01)[39m

      [36m### Bug Fixes[39m

      - stabilize release candidate ([e4bd252](https://github.com/mock-owner/mock-repo/commit/e4bd2526da105ae9ffaa942f175b54d6212470ab))
      ",
        ],
      ]
    `)

    // User 3: Merge the stabilized release branch back into main, then start
    // the 1.3.0 development cycle
    await temporaryDirectoryTask(async (cwd) => {
      await cloneGitRepository(cwd, remote)
      await execGit(cwd, ['config', 'user.name', 'User Three'])
      await execGit(cwd, ['config', 'user.email', 'user3@example.com'])

      await fetchReleaseBranch(cwd)
      await execGit(cwd, ['merge', 'origin/release/1.2.0'])

      await writePackageJson(cwd, { name: 'app', version: '1.3.0-dev.0' })
      await execGit(cwd, ['add', '.'])
      await execGit(cwd, ['commit', '-m', 'chore: start 1.3.0 development'])
      await execGit(cwd, ['tag', 'v1.3.0-dev.0'])
      await pushGitChanges(cwd, 'main', 'v1.3.0-dev.0')
    })

    // User 4: Add a feature on main for the next development cycle
    await commitFeatureToMainline(remote)

    // CI workflow run on main continues the dev channel from v1.3.0-dev.0
    await temporaryDirectoryTask(async (cwd) => {
      await cloneGitRepository(cwd, remote)

      const logger = await executeWorkflowRun(cwd)

      expect(logger.mock.calls).toMatchInlineSnapshot(`
        [
          [
            "Active plugins: @reelout/core/analyzer, @reelout/core/builder, @reelout/core/changelog, @reelout/npm, @reelout/git, @reelout/github",
          ],
          [
            "Status: [32mSUCCESS[39m",
          ],
          [
            "Release complete: [1m[32m1 released[39m[22m [90m(1)[39m

        [44m app [49m[42m 1.3.0-dev.1 ← 1.3.0-dev.0 [49m[90m minor [39m

        [36m## [1.3.0-dev.1](https://github.com/mock-owner/mock-repo/compare/v1.3.0-dev.0...v1.3.0-dev.1) (2026-01-01)[39m

        [36m### Features[39m

        - add next cycle feature ([9038dae](https://github.com/mock-owner/mock-repo/commit/9038dae5f3e4c05334c2fd48cb5796f5ab188759))
        ",
          ],
        ]
      `)
    })

    // Final checks: fast-forward merge topology, tags, tag connectivity, and
    // changelog contents
    await temporaryDirectoryTask(async (cwd) => {
      await cloneGitRepository(cwd, remote)
      await restoreFullGitHistory(cwd)

      const pkg = await buildPackage({
        rootDir: cwd,
        packageDir: '.',
        workspace,
        packageManager: 'npm',
      })

      expect(await getGitCommitSubjects(cwd)).toMatchInlineSnapshot(`
        [
          "chore: start 1.2.0 development",
          "fix: stabilize release candidate",
          "chore: release 1.2.0",
          "chore: start 1.3.0 development",
          "feat: add next cycle feature",
          "chore: release 1.3.0-dev.1",
        ]
      `)
      expect(await getGitTags(cwd)).toMatchInlineSnapshot(`
        [
          "v1.2.0 ## Bug Fixes

        - stabilize release candidate ([e4bd252](https://github.com/mock-owner/mock-repo/commit/e4bd2526da105ae9ffaa942f175b54d6212470ab))",
          "v1.2.0-dev.0",
          "v1.3.0-dev.0",
          "v1.3.0-dev.1 ## Features

        - add next cycle feature ([9038dae](https://github.com/mock-owner/mock-repo/commit/9038dae5f3e4c05334c2fd48cb5796f5ab188759))",
        ]
      `)
      expect(await verifyPackageTag(cwd, pkg, 'v1.2.0')).toBe(true)
      expect(await verifyPackageTag(cwd, pkg, 'v1.3.0-dev.0')).toBe(true)

      const changelog = await readFile(path.join(cwd, 'CHANGELOG.md'), 'utf-8')

      expect(changelog).toMatchInlineSnapshot(`
        "# Changelog

        ## [1.3.0-dev.1](https://github.com/mock-owner/mock-repo/compare/v1.3.0-dev.0...v1.3.0-dev.1) (2026-01-01)

        ### Features

        - add next cycle feature ([9038dae](https://github.com/mock-owner/mock-repo/commit/9038dae5f3e4c05334c2fd48cb5796f5ab188759))

        ## [1.2.0](https://github.com/mock-owner/mock-repo/compare/v1.2.0-dev.0...v1.2.0) (2026-01-01)

        ### Bug Fixes

        - stabilize release candidate ([e4bd252](https://github.com/mock-owner/mock-repo/commit/e4bd2526da105ae9ffaa942f175b54d6212470ab))
        "
      `)
    })
  })
}, 60_000)

// Topology: the release branch is never merged and main continues the
// dev channel on its own:
//
//   main          B0 -- X -- E -- (CI: release 1.3.0-dev.1)
//                     \
//                      C -- D      release/1.2.0, never merged
//
//   B0  chore: start 1.2.0 development  (tag v1.2.0-dev.0)
//   C   fix: stabilize release candidate
//   D   chore: release 1.2.0             (tag v1.2.0, disconnected from main)
//   X   chore: start 1.3.0 development  (tag v1.3.0-dev.0)
//   E   feat: add next cycle feature

test('continues the dev release channel on main while the release branch stays unmerged', async () => {
  await temporaryDirectoryTask(async (remote) => {
    // User 1: Initialize the repository in the 1.2.0 development cycle
    await initializeDevRepository(remote)

    // CI workflow run on the release branch publishes the 1.2.0 stable release
    // which is never merged back into main
    await stabilizeReleaseOnBranch(remote)

    // User 3: Start the 1.3.0 development cycle on main from the branch point
    await startNextDevCycleOnMain(remote)

    // User 4: Add a feature on main for the next development cycle
    await commitFeatureToMainline(remote)

    // CI workflow run on main continues the dev channel from v1.3.0-dev.0
    await temporaryDirectoryTask(async (cwd) => {
      await cloneGitRepository(cwd, remote)

      const logger = await executeWorkflowRun(cwd)

      expect(logger.mock.calls).toMatchInlineSnapshot(`
        [
          [
            "Active plugins: @reelout/core/analyzer, @reelout/core/builder, @reelout/core/changelog, @reelout/npm, @reelout/git, @reelout/github",
          ],
          [
            "Status: [32mSUCCESS[39m",
          ],
          [
            "Release complete: [1m[32m1 released[39m[22m [90m(1)[39m

        [44m app [49m[42m 1.3.0-dev.1 ← 1.3.0-dev.0 [49m[90m minor [39m

        [36m## [1.3.0-dev.1](https://github.com/mock-owner/mock-repo/compare/v1.3.0-dev.0...v1.3.0-dev.1) (2026-01-01)[39m

        [36m### Features[39m

        - add next cycle feature ([59538bd](https://github.com/mock-owner/mock-repo/commit/59538bdb0b4cf80c099138a18c96a1bd3e573d7e))
        ",
          ],
        ]
      `)
    })

    // Final checks: tags, tag connectivity, and changelog contents
    await temporaryDirectoryTask(async (cwd) => {
      await cloneGitRepository(cwd, remote)
      await restoreFullGitHistory(cwd)

      const pkg = await buildPackage({
        rootDir: cwd,
        packageDir: '.',
        workspace,
        packageManager: 'npm',
      })

      expect(await getGitTags(cwd)).toMatchInlineSnapshot(`
        [
          "v1.2.0-dev.0",
          "v1.3.0-dev.0",
          "v1.3.0-dev.1 ## Features

        - add next cycle feature ([59538bd](https://github.com/mock-owner/mock-repo/commit/59538bdb0b4cf80c099138a18c96a1bd3e573d7e))",
        ]
      `)
      expect(await verifyPackageTag(cwd, pkg, 'v1.2.0')).toBe(false)
      expect(await verifyPackageTag(cwd, pkg, 'v1.3.0-dev.0')).toBe(true)

      const changelog = await readFile(path.join(cwd, 'CHANGELOG.md'), 'utf-8')

      expect(changelog).toMatchInlineSnapshot(`
        "# Changelog

        ## [1.3.0-dev.1](https://github.com/mock-owner/mock-repo/compare/v1.3.0-dev.0...v1.3.0-dev.1) (2026-01-01)

        ### Features

        - add next cycle feature ([59538bd](https://github.com/mock-owner/mock-repo/commit/59538bdb0b4cf80c099138a18c96a1bd3e573d7e))
        "
      `)
    })

    // The unmerged release branch keeps its own 1.2.0 stable release
    await temporaryDirectoryTask(async (cwd) => {
      await cloneGitRepository(cwd, remote, 'release/1.2.0')
      await restoreFullGitHistory(cwd)

      expect(await getGitTags(cwd)).toMatchInlineSnapshot(`
        [
          "v1.2.0 ## Bug Fixes

        - stabilize release candidate ([5926e2b](https://github.com/mock-owner/mock-repo/commit/5926e2bfa72a5fabba7da34e175024d09979b016))",
          "v1.2.0-dev.0",
        ]
      `)
    })
  })
}, 60_000)

// Topology: the diverged release branch merges back into main with a
// merge commit (package.json conflicts on both sides; the resolution
// keeps the dev version 1.3.0-dev.0):
//
//   main          B0 -- X -------- M -- E -- (CI: release 1.3.0-dev.1)
//                     \          /
//                      C -- D --+      release/1.2.0
//
//   B0  chore: start 1.2.0 development  (tag v1.2.0-dev.0)
//   C   fix: stabilize release candidate
//   D   chore: release 1.2.0             (tag v1.2.0)
//   X   chore: start 1.3.0 development  (tag v1.3.0-dev.0)
//   M   merge of X and D (keeps 1.3.0-dev.0 in package.json)
//   E   feat: add next cycle feature

test('continues the dev release channel after merging a diverged release branch into main', async () => {
  await temporaryDirectoryTask(async (remote) => {
    // User 1: Initialize the repository in the 1.2.0 development cycle
    await initializeDevRepository(remote)

    // CI workflow run on the release branch publishes the 1.2.0 stable release
    await stabilizeReleaseOnBranch(remote)

    // User 3: Start the 1.3.0 development cycle on main, then merge the
    // diverged release branch back, keeping the dev version on conflict
    await temporaryDirectoryTask(async (cwd) => {
      await cloneGitRepository(cwd, remote)
      await execGit(cwd, ['config', 'user.name', 'User Three'])
      await execGit(cwd, ['config', 'user.email', 'user3@example.com'])

      await writePackageJson(cwd, { name: 'app', version: '1.3.0-dev.0' })
      await execGit(cwd, ['add', '.'])
      await execGit(cwd, ['commit', '-m', 'chore: start 1.3.0 development'])
      await execGit(cwd, ['tag', 'v1.3.0-dev.0'])

      await fetchReleaseBranch(cwd)
      await execGit(cwd, ['merge', 'origin/release/1.2.0']).catch(() => {})
      await writePackageJson(cwd, { name: 'app', version: '1.3.0-dev.0' })
      await execGit(cwd, ['add', '.'])
      await execGit(cwd, ['commit', '--no-edit'])

      await pushGitChanges(cwd, 'main', 'v1.3.0-dev.0')
    })

    // User 4: Add a feature on main for the next development cycle
    await commitFeatureToMainline(remote)

    // CI workflow run on main continues the dev channel from v1.3.0-dev.0.
    // The mocked `readGitHistory` pagination (pageSize 1) walks first parents
    // only, so the merged branch commits are not revisited here; the unit
    // test in `readPackageHistory.test.ts` pins the default pagination slice
    // where those commits are included.
    await temporaryDirectoryTask(async (cwd) => {
      await cloneGitRepository(cwd, remote)

      const logger = await executeWorkflowRun(cwd)

      expect(logger.mock.calls).toMatchInlineSnapshot(`
        [
          [
            "Active plugins: @reelout/core/analyzer, @reelout/core/builder, @reelout/core/changelog, @reelout/npm, @reelout/git, @reelout/github",
          ],
          [
            "Status: [32mSUCCESS[39m",
          ],
          [
            "Release complete: [1m[32m1 released[39m[22m [90m(1)[39m

        [44m app [49m[42m 1.3.0-dev.1 ← 1.3.0-dev.0 [49m[90m minor [39m

        [36m## [1.3.0-dev.1](https://github.com/mock-owner/mock-repo/compare/v1.3.0-dev.0...v1.3.0-dev.1) (2026-01-01)[39m

        [36m### Features[39m

        - add next cycle feature ([7dae7d8](https://github.com/mock-owner/mock-repo/commit/7dae7d8693ee2a64503b8014cba1dc6a72de4997))
        ",
          ],
        ]
      `)
    })

    // Final checks: merge topology, tags, tag connectivity, and changelog
    await temporaryDirectoryTask(async (cwd) => {
      await cloneGitRepository(cwd, remote)
      await restoreFullGitHistory(cwd)

      const pkg = await buildPackage({
        rootDir: cwd,
        packageDir: '.',
        workspace,
        packageManager: 'npm',
      })

      expect(await getGitCommitSubjects(cwd)).toMatchInlineSnapshot(`
        [
          "chore: start 1.2.0 development",
          "fix: stabilize release candidate",
          "chore: release 1.2.0",
          "chore: start 1.3.0 development",
          "Merge remote-tracking branch 'origin/release/1.2.0'",
          "feat: add next cycle feature",
          "chore: release 1.3.0-dev.1",
        ]
      `)
      expect(await getGitTags(cwd)).toMatchInlineSnapshot(`
        [
          "v1.2.0 ## Bug Fixes

        - stabilize release candidate ([fb5549d](https://github.com/mock-owner/mock-repo/commit/fb5549dc1e608d4cf9ba0358cb954453d029324e))",
          "v1.2.0-dev.0",
          "v1.3.0-dev.0",
          "v1.3.0-dev.1 ## Features

        - add next cycle feature ([7dae7d8](https://github.com/mock-owner/mock-repo/commit/7dae7d8693ee2a64503b8014cba1dc6a72de4997))",
        ]
      `)
      expect(await verifyPackageTag(cwd, pkg, 'v1.2.0')).toBe(true)
      expect(await verifyPackageTag(cwd, pkg, 'v1.3.0-dev.0')).toBe(true)

      const changelog = await readFile(path.join(cwd, 'CHANGELOG.md'), 'utf-8')

      expect(changelog).toMatchInlineSnapshot(`
        "# Changelog

        ## [1.3.0-dev.1](https://github.com/mock-owner/mock-repo/compare/v1.3.0-dev.0...v1.3.0-dev.1) (2026-01-01)

        ### Features

        - add next cycle feature ([7dae7d8](https://github.com/mock-owner/mock-repo/commit/7dae7d8693ee2a64503b8014cba1dc6a72de4997))

        ## [1.2.0](https://github.com/mock-owner/mock-repo/compare/v1.2.0-dev.0...v1.2.0) (2026-01-01)

        ### Bug Fixes

        - stabilize release candidate ([fb5549d](https://github.com/mock-owner/mock-repo/commit/fb5549dc1e608d4cf9ba0358cb954453d029324e))
        "
      `)
    })
  })
}, 60_000)
