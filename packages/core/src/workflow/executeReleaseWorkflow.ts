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

/** Failure of a `finalize` handler, collected for the post-report warning. */
interface FinalizeFailure {
  plugin: string
  error: unknown
}

/**
 * Resolve a plugin's hook entry into a normalized hook definition.
 *
 * Normalizes the plugin's hook entry — a bare handler function or a
 * `{ priority, handler }` definition — and wraps the handler in shared timing
 * and logging middleware. When the wrapped handler throws, the failure is
 * attributed to the current hook and plugin on `context.outcome` before the
 * error rethrows, except for `finalize` handlers whose failures never change
 * the workflow outcome.
 *
 * @param hookName Name of the hook to resolve
 * @param plugin Plugin owning the hook entry
 * @returns Normalized hook definition, or `undefined` when the plugin does not
 * implement the hook
 */
function resolvePluginHook(
  hookName: ReleaseHookName,
  plugin: ReleasePlugin
): ReleaseHookDefinition | undefined {
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

        if (hookName !== 'finalize') {
          context.outcome ??= {
            status: 'failure',
            error: err,
            phase: current,
          }
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
 * Collect `finalize` handler failures for the post-report warning.
 *
 * Records a thrown error with the owning plugin and rethrows it, leaving the
 * rescue to the hook manager middleware so the remaining `finalize` handlers
 * still run.
 *
 * @param handler Finalize handler to wrap
 * @param plugin Plugin owning the finalize handler
 * @param failures Collected finalize failures
 * @returns Wrapped finalize handler
 */
function collectFinalizeFailures(
  handler: HookHandler<ReleaseContext>,
  plugin: ReleasePlugin,
  failures: FinalizeFailure[]
): HookHandler<ReleaseContext> {
  return async (context, next) => {
    try {
      return await handler(context, next)
    } catch (error) {
      failures.push({ plugin: plugin.name, error })
      throw error
    }
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
 * the hook manager middleware rescues the error so the remaining handlers
 * still run, and each failure is logged as a warning after the report. A
 * failing `finalize` handler never changes the workflow outcome and never
 * masks the original workflow error.
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
  const phaseHookNames = RELEASE_HOOK_NAMES.filter(
    (name) => name !== 'finalize'
  )

  context.outcome = null

  const finalizeFailures: FinalizeFailure[] = []

  const manager = new HookManager<
    Record<ReleaseHookName, HookHandler<ReleaseContext>>
  >(async (context, registration, next) => {
    if (registration.name !== 'finalize') {
      return registration.handler(context, next)
    }

    try {
      return await registration.handler(context, next)
    } catch {
      return next(context)
    }
  })

  for (const hookName of RELEASE_HOOK_NAMES) {
    for (const plugin of plugins) {
      const definition = resolvePluginHook(hookName, plugin)

      if (!definition) continue

      const handler =
        hookName === 'finalize'
          ? collectFinalizeFailures(
              definition.handler,
              plugin,
              finalizeFailures
            )
          : definition.handler

      manager.on(hookName, handler, definition.priority)
    }
  }

  const dispatch = async (
    index: number,
    context: ReleaseContext
  ): Promise<void> => {
    const hook = phaseHookNames[index]

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

  await manager.emit('finalize', context)

  const report = generateReleaseReport(context)

  printReleaseReport(context.logger, report)
  appendReleaseReportSummary(context.logger, context.env, report)
  printReleaseReportAnnotation(context.env, context.stdout, report)

  for (const failure of finalizeFailures) {
    if (failure.error === context.outcome.error) continue

    context.logger.warn(
      `Plugin "${failure.plugin}" could not finalize: ${
        failure.error instanceof Error
          ? failure.error.message
          : String(failure.error)
      }`
    )
  }

  if (context.outcome.status === 'failure') {
    throw context.outcome.error
  }
}
