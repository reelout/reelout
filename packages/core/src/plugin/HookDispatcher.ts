// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

export type Next<Context> = (context: Context) => Promise<void>

export type Middleware<Context> = {
  bivariant(context: Context, next: Next<Context>): void | Promise<void>
}['bivariant']

export const Priority = {
  High: 50,
  Normal: 0,
  Low: -50,
} as const

/**
 * Registration options accepted by `on`.
 */
export interface RegistrationOptions<Meta> {
  priority?: number | undefined
  meta?: Meta | undefined
}

export interface Registration<HookName, Context, Meta = undefined> {
  hook: HookName
  priority: number
  middleware: Middleware<Context>
  meta: Meta | undefined
}

/**
 * Intercept a registered middleware during dispatch.
 *
 * Runs in place of every registered middleware, receiving the shared
 * `context`, the `registration` being dispatched — including its `priority`
 * and `meta` — and the `next` function that continues with the following
 * middleware.
 */
export type Interceptor<HookName, Context, Meta = undefined> = (
  context: Context,
  registration: Registration<HookName, Context, Meta>,
  next: Next<Context>
) => void | Promise<void>

type InferContext<Handler extends Middleware<unknown>> =
  Handler extends Middleware<infer Context> ? Context : never

/**
 * Dispatch registered hooks through asynchronous execution chains.
 *
 * Stores middleware in a prioritized registry and executes them sequentially
 * in priority order.
 */
export class HookDispatcher<
  HookMap extends Record<keyof HookMap, Middleware<unknown>>,
  Meta = undefined,
> {
  readonly #registry = new Map<
    keyof HookMap,
    Registration<keyof HookMap, InferContext<HookMap[keyof HookMap]>, Meta>[]
  >()

  readonly #interceptor:
    | Interceptor<keyof HookMap, InferContext<HookMap[keyof HookMap]>, Meta>
    | undefined

  /**
   * Create a hook dispatcher.
   *
   * @param interceptor Wrapper invoked in place of every registered
   * middleware during dispatch
   */
  constructor(
    interceptor?: Interceptor<
      keyof HookMap,
      InferContext<HookMap[keyof HookMap]>,
      Meta
    >
  ) {
    this.#interceptor = interceptor
  }

  /**
   * Register middleware for a specific hook.
   *
   * Adds the `middleware` to the internal registry for `hook` and sorts the
   * list so higher-priority middleware runs first. An omitted or `undefined`
   * `options.priority` defaults to `Priority.Normal`; `options.meta` is
   * carried on the registration for the constructor interceptor.
   *
   * @param hook Name of the hook to register
   * @param middleware Function executed when the hook dispatches
   * @param options Registration options carrying the execution order rank and
   * the metadata exposed to the constructor interceptor
   */
  on<HookName extends keyof HookMap>(
    hook: HookName,
    middleware: Middleware<InferContext<HookMap[HookName]>>,
    options?: RegistrationOptions<Meta>
  ): void {
    const registrations = this.#registry.get(hook) ?? []

    registrations.push({
      hook,
      middleware,
      priority: options?.priority ?? Priority.Normal,
      meta: options?.meta,
    })

    registrations.sort((a, b) => b.priority - a.priority)

    this.#registry.set(hook, registrations)
  }

  /**
   * Unregister middleware from a specific hook.
   *
   * Removes matching `middleware` references from the internal registry for
   * `hook`. Takes no action if `hook` has no registered middleware.
   *
   * @param hook Name of the hook to unregister from
   * @param middleware Reference of the middleware function to remove
   */
  off<HookName extends keyof HookMap>(
    hook: HookName,
    middleware: Middleware<InferContext<HookMap[HookName]>>
  ): void {
    const registrations = this.#registry.get(hook)

    if (!registrations) return

    this.#registry.set(
      hook,
      registrations.filter(
        (registration) => registration.middleware !== middleware
      )
    )
  }

  /**
   * Dispatch all middleware registered to a hook.
   *
   * Passes `context` through the middleware pipeline in descending priority
   * order and dispatches each registration through the constructor
   * interceptor when one is provided. Enables middleware to control
   * execution flow using `next` and executes `done` after the last
   * middleware completes.
   *
   * @param hook Name of the hook to dispatch
   * @param context Shared payload passed into each middleware
   * @param done Optional final callback run after the pipeline completes
   * @returns Promise that resolves when execution completes
   */
  async dispatch<HookName extends keyof HookMap>(
    hook: HookName,
    context: InferContext<HookMap[HookName]>,
    done?: Next<InferContext<HookMap[HookName]>>
  ): Promise<void> {
    type Context = InferContext<HookMap[HookName]>

    const registrations = this.#registry.get(hook) ?? []

    const interceptor = this.#interceptor

    const run = async (index: number, context: Context): Promise<void> => {
      const registration = registrations[index]

      if (!registration) {
        return done ? await done(context) : undefined
      }

      let isNextCalled = false

      const next: Next<Context> = async (context) => {
        if (isNextCalled) return
        isNextCalled = true
        return await run(index + 1, context)
      }

      const middleware: Middleware<Context> = interceptor
        ? (context, next) => interceptor(context, registration, next)
        : registration.middleware

      return await middleware(context, next)
    }

    return await run(0, context)
  }
}
