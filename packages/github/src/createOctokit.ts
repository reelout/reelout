// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { Octokit } from '@octokit/rest'

/**
 * Create an Octokit client for the GitHub REST API.
 *
 * Silences Octokit's built-in console logging so release output stays clean.
 *
 * @param token GitHub authentication token
 * @returns An authenticated Octokit client
 */
export function createOctokit(token: string): Octokit {
  /* istanbul ignore next: the silenced log callbacks have empty bodies that never execute. */
  return new Octokit({
    auth: token,
    log: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
  })
}
