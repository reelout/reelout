// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import {
  HookDispatcher,
  Priority,
  type Middleware,
  type Next,
} from '@reelout/core'
import { beforeEach, expect, test, vi } from 'vitest'

interface TestContext {
  value: string
  steps: string[]
}

interface PluginMeta {
  name: string
}

let context: TestContext
let dispatcher: HookDispatcher<Record<string, Middleware<TestContext>>>

beforeEach(() => {
  context = { value: 'test', steps: [] }
  dispatcher = new HookDispatcher<Record<string, Middleware<TestContext>>>()
})

test('executes middleware in registration order when priority is omitted', async () => {
  dispatcher.on('run', (ctx, next) => {
    ctx.steps.push('first')
    return next(ctx)
  })

  dispatcher.on('run', (ctx, next) => {
    ctx.steps.push('second')
    return next(ctx)
  })

  await dispatcher.dispatch('run', context)

  expect(context.steps).toEqual(['first', 'second'])
})

test('executes middleware in descending priority order when priorities differ', async () => {
  dispatcher.on(
    'run',
    (ctx, next) => {
      ctx.steps.push('normal')
      return next(ctx)
    },
    { priority: Priority.Normal }
  )

  dispatcher.on(
    'run',
    (ctx, next) => {
      ctx.steps.push('high')
      return next(ctx)
    },
    { priority: Priority.High }
  )

  dispatcher.on(
    'run',
    (ctx, next) => {
      ctx.steps.push('low')
      return next(ctx)
    },
    { priority: Priority.Low }
  )

  await dispatcher.dispatch('run', context)

  expect(context.steps).toEqual(['high', 'normal', 'low'])
})

test('does not execute middleware when unregistered before dispatch', async () => {
  const middleware = async (ctx: TestContext, next: Next<TestContext>) => {
    ctx.steps.push('removed')
    return next(ctx)
  }

  dispatcher.on('run', middleware)
  dispatcher.off('run', middleware)

  await dispatcher.dispatch('run', context)

  expect(context.steps).toEqual([])
})

test('does not throw when unregistering non-existent hook or middleware', async () => {
  const middleware = (ctx: TestContext) => {}

  expect(() => dispatcher.off('unknown', middleware)).not.toThrow()

  dispatcher.on('run', middleware)

  expect(() => dispatcher.off('other', middleware)).not.toThrow()

  await dispatcher.dispatch('run', context)

  expect(context.steps).toEqual([])
})

test('is a no-op when dispatching a hook with no registered middleware', async () => {
  await dispatcher.dispatch('unknown', context)

  expect(context.value).toBe('test')
  expect(context.steps).toEqual([])
})

test('retains context modifications when pipeline execution completes', async () => {
  dispatcher.on('run', async (ctx, next) => {
    await next(ctx)
    ctx.value = `${ctx.value}-outer`
  })

  dispatcher.on('run', async (ctx, next) => {
    await next(ctx)
    ctx.value = `${ctx.value}-inner`
  })

  await dispatcher.dispatch('run', context)

  expect(context.value).toBe('test-inner-outer')
})

test('halts downstream execution when next callback is omitted', async () => {
  dispatcher.on('run', async (ctx) => {
    ctx.steps.push('stopped')
    return
  })

  dispatcher.on('run', (ctx, next) => {
    ctx.steps.push('never-reached')
    return next(ctx)
  })

  await dispatcher.dispatch('run', context)

  expect(context.steps).toEqual(['stopped'])
})

test('prevents duplicate downstream execution when next callback is called multiple times', async () => {
  dispatcher.on('run', async (ctx, next) => {
    ctx.steps.push('first-call')
    await next(ctx)
    return next(ctx)
  })

  dispatcher.on('run', (ctx, next) => {
    ctx.steps.push('second')
    return next(ctx)
  })

  await dispatcher.dispatch('run', context)

  expect(context.steps).toEqual(['first-call', 'second'])
})

test('invokes done callback with final context when pipeline completes', async () => {
  const terminalCallback = vi.fn(async (ctx: TestContext) => {
    ctx.value = 'modified-by-terminal'
  })

  dispatcher.on('run', (ctx, next) => {
    ctx.steps.push('step')
    return next(ctx)
  })

  await dispatcher.dispatch('run', context, terminalCallback)

  expect(context.steps).toEqual(['step'])
  expect(context.value).toBe('modified-by-terminal')
  expect(terminalCallback).toHaveBeenCalledOnce()
  expect(terminalCallback).toHaveBeenCalledWith(context)
})

test('invokes done callback when dispatching unregistered hook', async () => {
  const terminalCallback = vi.fn(async (ctx: TestContext) => {})

  await dispatcher.dispatch('unknown', context, terminalCallback)

  expect(terminalCallback).toHaveBeenCalledOnce()
  expect(terminalCallback).toHaveBeenCalledWith(context)
})

test('rethrows error when middleware throws an exception', async () => {
  dispatcher.on('run', (ctx, next) => {
    return next(ctx)
  })

  dispatcher.on('run', () => {
    throw new Error('Middleware execution failed')
  })

  await expect(dispatcher.dispatch('run', context)).rejects.toThrow(
    'Middleware execution failed'
  )
})

test('dispatches each registered middleware through the constructor interceptor in priority order', async () => {
  const dispatched: string[] = []

  const dispatcher = new HookDispatcher<
    Record<string, Middleware<TestContext>>
  >(async (ctx, registration, next) => {
    dispatched.push(`${registration.hook}:${registration.priority}`)

    return registration.middleware(ctx, next)
  })

  dispatcher.on(
    'run',
    (ctx, next) => {
      ctx.steps.push('normal')
      return next(ctx)
    },
    { priority: Priority.Normal }
  )

  dispatcher.on(
    'run',
    (ctx, next) => {
      ctx.steps.push('high')
      return next(ctx)
    },
    { priority: Priority.High }
  )

  await dispatcher.dispatch('run', context)

  expect(dispatched).toEqual([`run:${Priority.High}`, `run:${Priority.Normal}`])
  expect(context.steps).toEqual(['high', 'normal'])
})

test('continues the remaining middleware when the interceptor rescues a middleware error', async () => {
  const dispatcher = new HookDispatcher<
    Record<string, Middleware<TestContext>>
  >(async (ctx, registration, next) => {
    try {
      return await registration.middleware(ctx, next)
    } catch {
      return next(ctx)
    }
  })

  dispatcher.on('run', () => {
    throw new Error('Rescued failure')
  })

  dispatcher.on('run', (ctx, next) => {
    ctx.steps.push('after-rescue')
    return next(ctx)
  })

  await expect(dispatcher.dispatch('run', context)).resolves.toBeUndefined()

  expect(context.steps).toEqual(['after-rescue'])
})

test('exposes registration meta to the constructor interceptor', async () => {
  const seen: (PluginMeta | undefined)[] = []

  const dispatcher = new HookDispatcher<
    Record<string, Middleware<TestContext>>,
    PluginMeta
  >(async (ctx, registration, next) => {
    seen.push(registration.meta)

    return registration.middleware(ctx, next)
  })

  dispatcher.on('run', (ctx, next) => next(ctx), {
    meta: { name: 'plugin-a' },
  })

  await dispatcher.dispatch('run', context)

  expect(seen).toEqual([{ name: 'plugin-a' }])
})

test('defaults meta to undefined and priority to normal when options are omitted', async () => {
  const seen: {
    meta: PluginMeta | undefined
    priority: number
  }[] = []

  const dispatcher = new HookDispatcher<
    Record<string, Middleware<TestContext>>,
    PluginMeta
  >(async (ctx, registration, next) => {
    seen.push({ meta: registration.meta, priority: registration.priority })

    return registration.middleware(ctx, next)
  })

  dispatcher.on('run', (ctx, next) => {
    ctx.steps.push('middleware')
    return next(ctx)
  })

  await dispatcher.dispatch('run', context)

  expect(seen).toEqual([{ meta: undefined, priority: Priority.Normal }])
  expect(context.steps).toEqual(['middleware'])
})
