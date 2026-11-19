// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { RELEASE_HOOK_NAMES } from '#config'
import { HookManager, type HookHandler } from '#plugin'
import type { ReleaseContext, ReleaseHookName, ReleasePlugin } from '#types'
import { colors } from 'consola/utils'
import {
  appendReleaseReportSummary,
  generateReleaseReport,
  printReleaseReport,
  printReleaseReportAnnotation,
} from './report'

/**
 * Lifecycle hooks that run in the sequential phase chain before the terminal
 * `finalize` emission.
 */
const PHASE_HOOK_NAMES = RELEASE_HOOK_NAMES.filter(
  (name) => name !== 'finalize'
)

type WorkflowHookManager = HookManager<
  Record<ReleaseHookName, HookHandler<ReleaseContext>>
>

interface FinalizeFailure {
  plugin: string
  error: unknown
}

interface PluginHookRegistration {
  /** Hook name the plugin handler registers under. */
  hookName: ReleaseHookName
  /** Plugin owning the hook entry. */
  plugin: ReleasePlugin
  /**
   * Handle a thrown handler error instead of rethrowing it.
   *
   * When provided, the wrapper passes a thrown error to this callback and
   * continues the middleware chain, so later handlers still run.
   */
  onHandlerError?: (error: unknown) => void
}

/**
 * Register a plugin's hook handler on the workflow hook manager.
 *
 * Normalizes the plugin's hook entry into a handler and priority, wraps the
 * handler in the shared phase-tracking, timing, and logging middleware, and
 * registers it under the registration's hook name. When `onHandlerError` is
 * provided, a thrown handler error is passed to it and the middleware chain
 * continues so later handlers still run; without it the error rethrows and
 * unwinds the chain.
 *
 * @param manager Hook manager receiving the wrapped handler
 * @param registration Plugin hook registration carrying the error strategy
 */
function registerPluginHook(
  manager: WorkflowHookManager,
  registration: PluginHookRegistration
): void {
  const { hookName, plugin } = registration

  let hook = plugin[hookName]

  if (typeof hook === 'function') {
    hook = { handler: hook }
  }

  const handler = hook?.handler
  const priority = hook?.priority

  if (!handler) return

  const isSilent = import.meta.env.MODE === 'test'

  manager.on(
    hookName,
    async (context, next) => {
      const current = (context.phase = {
        hook: hookName,
        plugin: plugin.name,
      })

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

        if (registration.onHandlerError) {
          registration.onHandlerError(err)
          return await runNext()
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
    priority
  )
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
 * run while the error unwinds, then every `finalize` handler runs with
 * `context.status` and `context.error` already set. When a `finalize` handler
 * throws, the remaining handlers still run: on a failed workflow each failure
 * is logged as a warning after the report, while on a successful workflow the
 * first failure fails the release. Failures in `finalize` never mask the
 * original workflow error.
 *
 * @param context Release execution context containing runtime options and logger
 * @param plugins List of release plugins to execute
 * @returns Promise that resolves when all workflow phases complete
 * @throws If a lifecycle hook fails, the workflow is cancelled, or a finalize
 * handler fails on an otherwise successful workflow
 */
export async function executeReleaseWorkflow(
  context: ReleaseContext,
  plugins: readonly ReleasePlugin[]
): Promise<void> {
  context.status = null
  context.error = null

  const manager = new HookManager<
    Record<ReleaseHookName, HookHandler<ReleaseContext>>
  >()

  const finalizeFailures: FinalizeFailure[] = []

  for (const hookName of PHASE_HOOK_NAMES) {
    for (const plugin of plugins) {
      registerPluginHook(manager, { hookName, plugin })
    }
  }

  for (const plugin of plugins) {
    registerPluginHook(manager, {
      hookName: 'finalize',
      plugin,
      onHandlerError: (error) =>
        finalizeFailures.push({ plugin: plugin.name, error }),
    })
  }

  const dispatch = async (
    index: number,
    context: ReleaseContext
  ): Promise<void> => {
    const hook = PHASE_HOOK_NAMES[index]

    if (!hook) return

    throwIfCancelled(context)

    return await manager.emit(hook, context, (context) =>
      dispatch(index + 1, context)
    )
  }

  let workflowError: unknown
  let hasWorkflowError = false
  let failedPhase: ReleaseContext['phase'] = null

  try {
    await dispatch(0, context)

    context.status = 'success'
  } catch (err) {
    hasWorkflowError = true
    workflowError = err
    failedPhase = context.phase
    context.status = 'failure'
    context.error = err
  }

  await manager.emit('finalize', context)

  const [firstFinalizeFailure] = finalizeFailures

  if (hasWorkflowError) {
    context.phase = failedPhase
  } else if (firstFinalizeFailure) {
    context.status = 'failure'
    context.error = firstFinalizeFailure.error
    context.phase = {
      hook: 'finalize',
      plugin: firstFinalizeFailure.plugin,
    }
  }

  const report = generateReleaseReport(context)

  printReleaseReport(context.logger, report)
  appendReleaseReportSummary(context.logger, context.env, report)
  printReleaseReportAnnotation(context.env, context.stdout, report)

  for (const failure of finalizeFailures) {
    if (failure.error === context.error) continue

    context.logger.warn(
      `Plugin "${failure.plugin}" could not finalize: ${
        failure.error instanceof Error
          ? failure.error.message
          : String(failure.error)
      }`
    )
  }

  if (hasWorkflowError) throw workflowError
  if (firstFinalizeFailure) throw firstFinalizeFailure.error
}
