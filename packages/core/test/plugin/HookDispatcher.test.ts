// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import {
  HookDispatcher,
  HookPriority,
  type HookMiddleware,
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
let dispatcher: HookDispatcher<Record<string, HookMiddleware<TestContext>>>

beforeEach(() => {
  context = { value: 'test', steps: [] }
  dispatcher = new HookDispatcher<Record<string, HookMiddleware<TestContext>>>()
})

test('executes handlers in registration order when priority is omitted', async () => {
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

test('executes handlers in descending priority order when priorities differ', async () => {
  dispatcher.on(
    'run',
    (ctx, next) => {
      ctx.steps.push('normal')
      return next(ctx)
    },
    { priority: HookPriority.Normal }
  )

  dispatcher.on(
    'run',
    (ctx, next) => {
      ctx.steps.push('high')
      return next(ctx)
    },
    { priority: HookPriority.High }
  )

  dispatcher.on(
    'run',
    (ctx, next) => {
      ctx.steps.push('low')
      return next(ctx)
    },
    { priority: HookPriority.Low }
  )

  await dispatcher.dispatch('run', context)

  expect(context.steps).toEqual(['high', 'normal', 'low'])
})

test('preserves registration order when handlers share equal priorities', async () => {
  dispatcher.on(
    'run',
    (ctx, next) => {
      ctx.steps.push('a')
      return next(ctx)
    },
    { priority: HookPriority.Normal }
  )

  dispatcher.on(
    'run',
    (ctx, next) => {
      ctx.steps.push('b')
      return next(ctx)
    },
    { priority: HookPriority.Normal }
  )

  await dispatcher.dispatch('run', context)

  expect(context.steps).toEqual(['a', 'b'])
})

test('does not execute handler when unregistered before dispatch', async () => {
  const handler = async (ctx: TestContext, next: Next<TestContext>) => {
    ctx.steps.push('removed')
    return next(ctx)
  }

  dispatcher.on('run', handler)
  dispatcher.off('run', handler)

  await dispatcher.dispatch('run', context)

  expect(context.steps).toEqual([])
})

test('does not throw when unregistering non-existent hook or handler', async () => {
  const handler = (ctx: TestContext) => {}

  expect(() => dispatcher.off('unknown', handler)).not.toThrow()

  dispatcher.on('run', handler)

  expect(() => dispatcher.off('other', handler)).not.toThrow()

  await dispatcher.dispatch('run', context)

  expect(context.steps).toEqual([])
})

test('does not mutate context when dispatching unregistered hook', async () => {
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

test('rethrows error when handler throws exception during execution', async () => {
  dispatcher.on('run', (ctx, next) => {
    return next(ctx)
  })

  dispatcher.on('run', () => {
    throw new Error('Handler execution failed')
  })

  await expect(dispatcher.dispatch('run', context)).rejects.toThrow(
    'Handler execution failed'
  )
})

test('dispatches each registered handler through the constructor middleware in priority order', async () => {
  const dispatched: string[] = []

  dispatcher = new HookDispatcher<Record<string, HookMiddleware<TestContext>>>(
    async (ctx, registration, next) => {
      dispatched.push(`${registration.name}:${registration.priority}`)

      return registration.handler(ctx, next)
    }
  )

  dispatcher.on(
    'run',
    (ctx, next) => {
      ctx.steps.push('normal')
      return next(ctx)
    },
    { priority: HookPriority.Normal }
  )

  dispatcher.on(
    'run',
    (ctx, next) => {
      ctx.steps.push('high')
      return next(ctx)
    },
    { priority: HookPriority.High }
  )

  await dispatcher.dispatch('run', context)

  expect(dispatched).toEqual([
    `run:${HookPriority.High}`,
    `run:${HookPriority.Normal}`,
  ])
  expect(context.steps).toEqual(['high', 'normal'])
})

test('continues the remaining handlers when the middleware rescues a handler error', async () => {
  dispatcher = new HookDispatcher<Record<string, HookMiddleware<TestContext>>>(
    async (ctx, registration, next) => {
      try {
        return await registration.handler(ctx, next)
      } catch {
        return next(ctx)
      }
    }
  )

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

test('exposes registration meta to the constructor middleware', async () => {
  const seen: (PluginMeta | undefined)[] = []

  const dispatcher = new HookDispatcher<
    Record<string, HookMiddleware<TestContext>>,
    PluginMeta
  >(async (ctx, registration, next) => {
    seen.push(registration.meta)

    return registration.handler(ctx, next)
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
    Record<string, HookMiddleware<TestContext>>,
    PluginMeta
  >(async (ctx, registration, next) => {
    seen.push({ meta: registration.meta, priority: registration.priority })

    return registration.handler(ctx, next)
  })

  dispatcher.on('run', (ctx, next) => {
    ctx.steps.push('handler')
    return next(ctx)
  })

  await dispatcher.dispatch('run', context)

  expect(seen).toEqual([{ meta: undefined, priority: HookPriority.Normal }])
  expect(context.steps).toEqual(['handler'])
})

test('orders handlers by priority supplied through registration options', async () => {
  dispatcher.on(
    'run',
    (ctx, next) => {
      ctx.steps.push('low')
      return next(ctx)
    },
    { priority: HookPriority.Low }
  )

  dispatcher.on('run', (ctx, next) => {
    ctx.steps.push('normal')
    return next(ctx)
  })

  await dispatcher.dispatch('run', context)

  expect(context.steps).toEqual(['normal', 'low'])
})
