// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { isTruthyString } from './isTruthyString'

/**
 * Determine whether the current process runs on a GitHub Actions runner.
 *
 * Checks if the `GITHUB_ACTIONS` environment variable is set to a truthy
 * value. Gates GitHub Actions-specific reporting such as job summaries and
 * annotations.
 *
 * @param env Readonly process environment variables object
 * @returns `true` if `env.GITHUB_ACTIONS` normalizes to a truthy string, otherwise `false`
 */
export function isGitHubActions(env: Readonly<NodeJS.ProcessEnv>): boolean {
  return isTruthyString(env.GITHUB_ACTIONS)
}
