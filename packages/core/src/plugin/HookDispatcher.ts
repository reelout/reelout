// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

export type Next<Context> = (context: Context) => Promise<void>

export type HookMiddleware<Context> = {
  bivariant(context: Context, next: Next<Context>): void | Promise<void>
}['bivariant']

export const HookPriority = {
  High: 50,
  Normal: 0,
  Low: -50,
} as const

/**
 * Registration options for a hook handler.
 */
interface HookOptions<Meta> {
  priority?: number | undefined
  meta?: Meta | undefined
}

interface Tap<HookName, Context, Meta = undefined> {
  name: HookName
  priority: number
  handler: HookMiddleware<Context>
  meta: Meta | undefined
}

/**
 * Intercept a registered handler during dispatch.
 *
 * Runs in place of every registered handler, receiving the shared `context`,
 * the `registration` being dispatched — including its `priority` and `meta` —
 * and the `next` function that continues with the following handler.
 */
export type Interceptor<HookName, Context, Meta = undefined> = (
  context: Context,
  registration: Tap<HookName, Context, Meta>,
  next: Next<Context>
) => void | Promise<void>

type InferContext<Handler extends HookMiddleware<unknown>> =
  Handler extends HookMiddleware<infer Context> ? Context : never

/**
 * Dispatch registered hooks through asynchronous execution chains.
 *
 * Stores handlers in a prioritized registry and executes them sequentially in
 * priority order.
 */
export class HookDispatcher<
  HookMap extends Record<keyof HookMap, HookMiddleware<unknown>>,
  Meta = undefined,
> {
  readonly #registry = new Map<
    keyof HookMap,
    Tap<keyof HookMap, InferContext<HookMap[keyof HookMap]>, Meta>[]
  >()

  readonly #middleware:
    | Interceptor<keyof HookMap, InferContext<HookMap[keyof HookMap]>, Meta>
    | undefined

  /**
   * Create a hook dispatcher.
   *
   * @param middleware Wrapper invoked in place of every registered handler
   * during dispatch
   */
  constructor(
    middleware?: Interceptor<
      keyof HookMap,
      InferContext<HookMap[keyof HookMap]>,
      Meta
    >
  ) {
    this.#middleware = middleware
  }

  /**
   * Register a handler function for a specific hook.
   *
   * Adds the `handler` to the internal registry for `name` and sorts the list
   * so higher-priority handlers run first. An omitted or `undefined`
   * `options.priority` defaults to `HookPriority.Normal`; `options.meta` is
   * carried on the registration for the constructor middleware.
   *
   * @param name Name of the hook to register
   * @param handler Callback function executed when the hook triggers
   * @param options Registration options carrying the execution order rank and
   * the metadata exposed to the constructor middleware
   */
  on<HookName extends keyof HookMap>(
    name: HookName,
    handler: HookMiddleware<InferContext<HookMap[HookName]>>,
    options?: HookOptions<Meta>
  ): void {
    const registrations = this.#registry.get(name) ?? []

    registrations.push({
      name,
      handler,
      priority: options?.priority ?? HookPriority.Normal,
      meta: options?.meta,
    })

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
    handler: HookMiddleware<InferContext<HookMap[HookName]>>
  ): void {
    const registrations = this.#registry.get(name)

    if (!registrations) return

    this.#registry.set(
      name,
      registrations.filter((registration) => registration.handler !== handler)
    )
  }

  /**
   * Dispatch all handlers registered to a hook.
   *
   * Passes `context` through the handler pipeline in descending priority order
   * and dispatches each registration through the constructor middleware when
   * one is provided. Enables handlers to control execution flow using `next`
   * and executes `done` after the last handler completes.
   *
   * @param name Name of the hook to dispatch
   * @param context Shared payload passed into each handler
   * @param done Optional final callback run after the pipeline completes
   * @returns Promise that resolves when execution completes
   */
  async dispatch<HookName extends keyof HookMap>(
    name: HookName,
    context: InferContext<HookMap[HookName]>,
    done?: Next<InferContext<HookMap[HookName]>>
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

      const next: Next<Context> = async (context) => {
        if (isNextCalled) return
        isNextCalled = true
        return await dispatch(index + 1, context)
      }

      const handler: HookMiddleware<Context> = middleware
        ? (context, next) => middleware(context, registration, next)
        : registration.handler

      return await handler(context, next)
    }

    return await dispatch(0, context)
  }
}
