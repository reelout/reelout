// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

export type NextFunction<Context> = (context: Context) => Promise<void>

export type HookHandler<Context> = {
  bivariant(context: Context, next: NextFunction<Context>): void | Promise<void>
}['bivariant']

export const HookPriority = {
  High: 50,
  Normal: 0,
  Low: -50,
} as const

interface HookRegistration<HookName, Context> {
  name: HookName
  priority: number
  handler: HookHandler<Context>
}

/**
 * Intercept a registered handler during emission.
 *
 * Runs in place of every registered handler, receiving the shared `context`,
 * the `registration` being dispatched, and the `next` function that continues
 * with the following handler.
 */
export type HandlerMiddleware<HookName, Context> = (
  context: Context,
  registration: HookRegistration<HookName, Context>,
  next: NextFunction<Context>
) => void | Promise<void>

type InferContext<Handler extends HookHandler<unknown>> =
  Handler extends HookHandler<infer Context> ? Context : never

/**
 * Manage hook registrations and asynchronous execution chains.
 *
 * Stores handlers in a prioritized registry and executes them sequentially in
 * priority order.
 */
export class HookManager<
  HookMap extends Record<keyof HookMap, HookHandler<unknown>>,
> {
  readonly #registry = new Map<
    keyof HookMap,
    HookRegistration<keyof HookMap, InferContext<HookMap[keyof HookMap]>>[]
  >()

  readonly #middleware:
    | HandlerMiddleware<keyof HookMap, InferContext<HookMap[keyof HookMap]>>
    | undefined

  /**
   * Create a hook manager.
   *
   * @param middleware Wrapper invoked in place of every registered handler
   * during emission
   */
  constructor(
    middleware?: HandlerMiddleware<
      keyof HookMap,
      InferContext<HookMap[keyof HookMap]>
    >
  ) {
    this.#middleware = middleware
  }

  /**
   * Register a handler function for a specific hook.
   *
   * Adds the `handler` to the internal registry for `name` and sorts the list
   * so higher-priority handlers run first.
   *
   * @param name Name of the hook to register
   * @param handler Callback function executed when the hook triggers
   * @param priority Execution order rank where higher values run earlier
   */
  on<HookName extends keyof HookMap>(
    name: HookName,
    handler: HookHandler<InferContext<HookMap[HookName]>>,
    priority: number = HookPriority.Normal
  ): void {
    const registrations = this.#registry.get(name) ?? []

    registrations.push({ name, handler, priority })

    registrations.sort((a, b) => b.priority - a.priority)

    this.#registry.set(name, registrations)
  }

  /**
   * Unregister a handler function from a specific hook.
   *
   * Removes matching `handler` references from the internal registry for
   * `name`. Takes no action if `name` has no registered handlers.
   *
   * @param name Name of the hook to unregister from
   * @param handler Reference of the handler function to remove
   */
  off<HookName extends keyof HookMap>(
    name: HookName,
    handler: HookMap[HookName]
  ): void {
    const registrations = this.#registry.get(name)

    if (!registrations) return

    this.#registry.set(
      name,
      registrations.filter((registration) => registration.handler !== handler)
    )
  }

  /**
   * Trigger execution of all handlers registered to a hook.
   *
   * Passes `context` through the handler pipeline in descending priority order
   * and dispatches each registration through the constructor middleware when
   * one is provided. Enables handlers to control execution flow using `next`
   * and executes `done` after the last handler completes.
   *
   * @param name Name of the hook to trigger
   * @param context Shared payload passed into each handler
   * @param done Optional final callback run after the pipeline completes
   * @returns Promise that resolves when execution completes
   */
  async emit<HookName extends keyof HookMap>(
    name: HookName,
    context: InferContext<HookMap[HookName]>,
    done?: NextFunction<InferContext<HookMap[HookName]>>
  ): Promise<void> {
    type Context = InferContext<HookMap[HookName]>

    const registrations = this.#registry.get(name) ?? []

    const middleware = this.#middleware

    const dispatch = async (index: number, context: Context): Promise<void> => {
      const registration = registrations[index]

      if (!registration) {
        return done ? await done(context) : undefined
      }

      let isNextCalled = false

      const next: NextFunction<Context> = async (context) => {
        if (isNextCalled) return
        isNextCalled = true
        return await dispatch(index + 1, context)
      }

      const handler: HookHandler<Context> = middleware
        ? (context, next) => middleware(context, registration, next)
        : registration.handler

      return await handler(context, next)
    }

    return await dispatch(0, context)
  }
}
