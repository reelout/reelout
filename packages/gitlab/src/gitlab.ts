// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { createHostReleasePlugin } from '@reelout/core'
import type { ReleasePlugin } from '@reelout/core'
import { version } from '../package.json'
import { createRelease } from './createRelease'
import { verifyToken } from './verifyToken'

/**
 * Built-in plugin that creates GitLab releases for finalized release plans.
 *
 * @remarks
 * **Lifecycle Stages:**
 * - `configure`: Leaves the plugin inactive when no GitLab-hosted repository
 *   was detected. Otherwise verifies the `GITLAB_TOKEN` environment variable:
 *   a missing token skips the plugin's `publish` step with a debug message — or
 *   fails the run in strict mode — and a provided token is verified against
 *   the release repository so an invalid token fails before any mutation,
 *   including under dry-run.
 * - `publish`: Skips release creation when the plugin is inactive. Creates
 *   GitLab releases in reverse alphabetical package order (ensuring the root
 *   package release is created last), overwriting the name and notes of any
 *   existing release for a planned tag. Automatically rolls back when
 *   subsequent publishing stages fail: releases created by this run are
 *   deleted and overwritten releases are restored to their original content.
 *
 * @returns A release plugin configured for GitLab release creation.
 */
const gitlab = (): ReleasePlugin =>
  createHostReleasePlugin({
    name: '@reelout/gitlab',
    version,
    host: 'gitlab',
    displayName: 'GitLab',
    tokenEnvKey: 'GITLAB_TOKEN',
    verifyToken,
    createRelease,
  })

export default gitlab
