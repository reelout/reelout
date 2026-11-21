// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { RELEASE_HOOK_NAMES } from '#config'
import { HookDispatcher, type HookMiddleware } from '#plugin'
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

/** Failure of a hook handler, recorded with the owning hook and plugin. */
interface HandlerFailure {
  hook: ReleaseHookName
  plugin: string
  error: unknown
}

/**
 * Resolve a plugin's hook entry into a normalized hook definition.
 *
 * Normalizes the plugin's hook entry — a bare handler function or a
 * `{ priority, handler }` definition — into its handler and priority.
 *
 * @param hookName Name of the hook to resolve
 * @param plugin Plugin owning the hook entry
 * @returns Normalized hook definition, or `undefined` when the plugin does
 * not implement the hook
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

  return { priority, handler }
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
 * Format a duration in milliseconds as a seconds string.
 *
 * @param duration Duration in milliseconds
 * @returns Duration formatted as seconds with two decimal places
 */
function formatDuration(duration: number): string {
  return `${(duration / 1000).toFixed(2)}s`
}

/**
 * Pick the console color for a duration, highlighting slow handlers.
 *
 * @param duration Duration in milliseconds
 * @returns Color function that warns when the duration reaches five seconds
 */
function durationColor(duration: number): (text: string) => string {
  return duration >= 5000 ? colors.yellow : colors.cyan
}

/**
 * Format a hook and its owning plugin as a display label.
 *
 * @param hook Name of the hook
 * @param plugin Name of the plugin owning the hook
 * @returns Gray hook name followed by the plugin name
 */
function hookLabel(hook: ReleaseHookName, plugin: string): string {
  return `${colors.gray(`[${hook}]`)} ${plugin}`
}

/**
 * Execute the complete release workflow across all configured plugins.
 *
 * Runs each lifecycle phase sequentially, dispatching plugin hooks in onion
 * order based on declared priority, and checks the abort signal before each
 * phase. Each dispatched handler runs through a single constructor
 * interceptor that also attributes failures to the owning hook and plugin,
 * collects handler failures, and rescues `finalize` errors so the remaining
 * `finalize` handlers still run. Outside `test` mode the interceptor logs
 * every handler's exclusive duration — its wall-clock time minus the time
 * consumed by downstream handlers — on completion. When a phase hook throws,
 * plugin rollbacks run while the error unwinds, then every `finalize`
 * handler runs with the failure recorded on `context.outcome`. Each
 * `finalize` failure is logged as a warning after the report. A failing
 * `finalize` handler never changes the workflow outcome and never masks the
 * original workflow error.
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

  const isSilent = import.meta.env.MODE === 'test'

  const handlerFailures: HandlerFailure[] = []

  const dispatcher = new HookDispatcher<
    Record<ReleaseHookName, HookMiddleware<ReleaseContext>>,
    ReleasePlugin
  >(async (context, registration, next) => {
    const plugin = registration.meta

    if (!plugin) return next(context)

    const hook = registration.name
    const label = hookLabel(hook, plugin.name)

    if (!isSilent) {
      context.logger.start(label)
    }

    const currentFrame = { startTime: performance.now() }
    const nextFrame = { duration: 0 }

    const runNext = async () => {
      const startTime = performance.now()

      try {
        return await next(context)
      } finally {
        nextFrame.duration += performance.now() - startTime
      }
    }

    const finish = (hasError: boolean): void => {
      const duration =
        performance.now() - currentFrame.startTime - nextFrame.duration
      const color = durationColor(duration)
      const message = [label, color(formatDuration(duration))].join(' ')

      if (!isSilent) {
        if (hasError) {
          context.logger.error(message)
        } else {
          context.logger.success(message)
        }
      }
    }

    try {
      const result = await registration.handler.call(plugin, context, runNext)

      finish(false)

      return result
    } catch (error) {
      handlerFailures.push({ hook, plugin: plugin.name, error })

      context.outcome ??= {
        status: 'failure',
        error,
        phase: { hook, plugin: plugin.name },
      }

      finish(true)

      if (hook === 'finalize') return next(context)

      throw error
    }
  })

  for (const hookName of RELEASE_HOOK_NAMES) {
    for (const plugin of plugins) {
      const definition = resolvePluginHook(hookName, plugin)

      if (!definition) continue

      dispatcher.on(hookName, definition.handler, {
        priority: definition.priority,
        meta: plugin,
      })
    }
  }

  const dispatch = async (
    index: number,
    context: ReleaseContext
  ): Promise<void> => {
    const hook = RELEASE_HOOK_NAMES[index]

    if (!hook) return

    if (hook === 'finalize') return await dispatch(index + 1, context)

    throwIfCancelled(context)

    return await dispatcher.dispatch(hook, context, (context) =>
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

  await dispatcher.dispatch('finalize', context)

  const report = generateReleaseReport(context)

  printReleaseReport(context.logger, report)
  appendReleaseReportSummary(context.logger, context.env, report)
  printReleaseReportAnnotation(context.env, context.stdout, report)

  for (const failure of handlerFailures) {
    if (failure.hook !== 'finalize') continue
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
