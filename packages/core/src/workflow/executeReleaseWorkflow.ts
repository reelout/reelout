// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { RELEASE_HOOK_NAMES } from '#config'
import { HookManager, type HookHandler } from '#plugin'
import type {
  ReleaseContext,
  ReleaseHookDefinition,
  ReleaseHookName,
  ReleasePlugin,
} from '#types'
import { colors } from 'consola/utils'
import {
  appendReleaseReportSummary,
  generateReleaseReport,
  printReleaseReport,
  printReleaseReportAnnotation,
} from './report'

interface woejwoejfowjefowje {
  hook: ReleaseHookName
  plugin: string
  error: unknown
}

function woeifwo(
  hookName: ReleaseHookName,
  plugin: ReleasePlugin
): ReleaseHookDefinition | void {
  let hook = plugin[hookName]

  if (typeof hook === 'function') {
    hook = { handler: hook }
  }

  const handler = hook?.handler
  const priority = hook?.priority

  if (!handler) return

  const isSilent = import.meta.env.MODE === 'test'

  return {
    priority,
    handler: async (context, next) => {
      const current = {
        hook: hookName,
        plugin: plugin.name,
      }

      const label = `${colors.gray(`[${current.hook}]`)} ${current.plugin}`
      let startedLogging = false
      let hasError = false

      if (!isSilent) {
        startedLogging = true
        context.logger.start(label)
      }

      const currentFrame = { startTime: performance.now() }
      const nextFrame = { duration: 0 }

      const runNext = async () => {
        const startTime = performance.now()

        try {
          return await next(context)
        } finally {
          nextFrame.duration = performance.now() - startTime
        }
      }

      try {
        return await handler.call(plugin, context, runNext)
      } catch (err) {
        hasError = true

        context.outcome ??= {
          status: 'failure',
          error: err,
          phase: current,
        }

        throw err
      } finally {
        if (startedLogging) {
          const duration =
            performance.now() - currentFrame.startTime - nextFrame.duration
          const color = duration >= 5000 ? colors.yellow : colors.cyan
          const message = [
            label,
            color(`${(duration / 1000).toFixed(2)}s`),
          ].join(' ')

          if (hasError) {
            context.logger.error(message)
          } else {
            context.logger.success(message)
          }
        }
      }
    },
  }
}

/**
 * Throw a cancellation error when the context abort signal has fired.
 *
 * Wraps the underlying `AbortError` so the workflow reports a readable
 * cancellation instead of a bare DOM exception.
 *
 * @param context Release execution context carrying the optional abort signal
 * @throws If the context abort signal has already fired
 */
function throwIfCancelled(context: ReleaseContext): void {
  const signal = context.signal

  if (!signal?.aborted) return

  try {
    signal.throwIfAborted()
  } catch (err) {
    throw new Error('Release cancelled.', { cause: err })
  }
}

/**
 * Execute the complete release workflow across all configured plugins.
 *
 * Runs each lifecycle phase sequentially, dispatching plugin hooks in onion
 * order based on declared priority, and checks the abort signal before each
 * phase. Emits the `finalize` hook on every terminal outcome so plugins can
 * send notifications and clean up: when a phase hook throws, plugin rollbacks
 * run while the error unwinds, then every `finalize` handler runs with the
 * failure recorded on `context.outcome`. When a `finalize` handler throws,
 * the remaining handlers still run and each failure is logged as a warning
 * after the report. A failing `finalize` handler never changes the workflow
 * outcome and never masks the original workflow error.
 *
 * @param context Release execution context containing runtime options and logger
 * @param plugins List of release plugins to execute
 * @returns Promise that resolves when all phases and `finalize` handlers
 * complete
 * @throws If a lifecycle hook fails or the workflow is cancelled
 */
export async function executeReleaseWorkflow(
  context: ReleaseContext,
  plugins: readonly ReleasePlugin[]
): Promise<void> {
  context.outcome = null

  const manager = new HookManager<
    Record<ReleaseHookName, HookHandler<ReleaseContext>>
  >(async (context, { name, handler }, next) => {
    if (name === 'finalize') {
      try {
        return await handler(context, next)
      } catch (err) {
        return next(context)
      }
    }

    return handler(context, next)
  })

  const weowfjowjoe: woejwoejfowjefowje[] = []

  for (const hook of RELEASE_HOOK_NAMES) {
    for (const plugin of plugins) {
      const x = woeifwo(hook, plugin)

      if (x) {
        const { handler } = x

        manager.on(
          hook,
          async (context, next) => {
            try {
              return await handler(context, next)
            } catch (err) {
              weowfjowjoe.push({ hook, plugin: plugin.name, error: err })
              throw err
            }
          },
          x.priority
        )
      }
    }
  }

  const dispatch = async (
    index: number,
    context: ReleaseContext
  ): Promise<void> => {
    const hook = RELEASE_HOOK_NAMES[index]

    if (!hook) return

    throwIfCancelled(context)

    return await manager.emit(hook, context, (context) =>
      dispatch(index + 1, context)
    )
  }

  try {
    await dispatch(0, context)

    context.outcome = {
      status: 'success',
      error: null,
      phase: null,
    }
  } catch (err) {
    context.outcome ??= {
      status: 'failure',
      error: err,
      phase: null,
    }
  }

  const report = generateReleaseReport(context)

  printReleaseReport(context.logger, report)
  appendReleaseReportSummary(context.logger, context.env, report)
  printReleaseReportAnnotation(context.env, context.stdout, report)

  for (const woejowjfo of weowfjowjoe) {
    if (woejowjfo.hook === 'finalize') {
      context.logger.warn(
        `Plugin "${woejowjfo.plugin}" could not finalize: ${
          woejowjfo.error instanceof Error
            ? woejowjfo.error.message
            : String(woejowjfo.error)
        }`
      )
    }
  }

  if (context.outcome.status === 'failure') {
    throw context.outcome.error
  }
}
