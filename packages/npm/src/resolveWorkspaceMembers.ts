// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import fs from 'node:fs/promises'
import path from 'node:path'
import { parse } from 'yaml'
import { readPackageJson } from './readPackageJson'

/**
 * Resolve workspace member glob patterns for the repository.
 *
 * Checks `pnpm-workspace.yaml` first (preferred), then falls back to
 * `package.json` workspaces configuration when present. A missing
 * `pnpm-workspace.yaml` falls through to the fallback, while an unreadable
 * or malformed file fails instead of silently degrading.
 *
 * @param cwd Repository working directory
 * @returns Array of workspace member glob patterns, or `null` if not found
 * @throws If `pnpm-workspace.yaml` exists but cannot be read or parsed
 */
export async function resolveWorkspaceMembers(
  cwd: string
): Promise<string[] | null> {
  let content: string | undefined

  try {
    content = await fs.readFile(path.join(cwd, 'pnpm-workspace.yaml'), 'utf-8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }

  if (content !== undefined) {
    const parsed = parse(content) as { packages?: string[] } | null

    if (Array.isArray(parsed?.packages)) {
      return parsed.packages
    }
  }

  try {
    const manifest = await readPackageJson<{ workspaces?: string[] }>(cwd)

    if (Array.isArray(manifest.workspaces)) {
      return manifest.workspaces
    }
  } catch {}

  return null
}
