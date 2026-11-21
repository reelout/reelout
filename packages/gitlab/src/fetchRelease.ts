// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { Gitlab } from '@gitbeaker/rest'
import { isNotFoundError } from './isNotFoundError'

/**
 * GitLab release content captured before an overwrite.
 */
export interface GitLabRelease {
  /** Release name as it existed before the overwrite. */
  name: string | null
  /** Release description as it existed before the overwrite. */
  description: string | null
}

/**
 * Fetch the GitLab release that exists for a tag.
 *
 * @param api Authenticated GitLab client
 * @param projectId Encoded project id the release belongs to
 * @param tagName Tag the release is looked up by
 * @returns The GitLab release content, or null when the tag has no release
 */
export async function fetchRelease(
  api: Gitlab,
  projectId: string,
  tagName: string
): Promise<GitLabRelease | null> {
  try {
    const release = await api.ProjectReleases.show(projectId, tagName)

    return { name: release.name, description: release.description }
  } catch (err) {
    if (isNotFoundError(err)) {
      return null
    }

    throw err
  }
}
