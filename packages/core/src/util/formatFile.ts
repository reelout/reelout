// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { ConsolaInstance } from 'consola/core'
import prettier from 'prettier'
import { formatError } from './formatError'

/**
 * Format `content` for `filePath` using Prettier when possible.
 *
 * Resolves project/editorconfig settings and formats the provided content.
 * Returns the original content on error or when no parser is inferred, and
 * reports the failure through `logger` at debug level when one is provided.
 *
 * @param filePath Path used to infer parser and config
 * @param content Source content to format
 * @param logger Optional logger that receives formatting failures
 * @returns Formatted content or original content on failure
 */
export async function formatFile(
  filePath: string,
  content: string,
  logger?: ConsolaInstance
): Promise<string> {
  try {
    const info = await prettier.getFileInfo(filePath, {
      resolveConfig: true,
    })

    const config = await prettier.resolveConfig(filePath, {
      editorconfig: true,
    })

    if (info.inferredParser == null) {
      return content
    }

    return await prettier.format(content, {
      ...config,
      parser: info.inferredParser,
      filepath: filePath,
    })
  } catch (error: unknown) {
    logger?.debug(
      `Formatting "${filePath}" failed and content stays unformatted: ${formatError(error)}`
    )

    return content
  }
}
