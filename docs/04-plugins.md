# Plugins

Plugins handle release analysis, changelogs, publishing, tags, and release
notes. This guide explains the lifecycle and how to create a custom plugin.

## The release lifecycle

Plugins register handlers for named hooks, which run in this order:

```text
configure → discover → analyze → build → write → publish → finalize
```

| Hook        | Purpose                                                          | Built-in users           |
| ----------- | ---------------------------------------------------------------- | ------------------------ |
| `configure` | Adjust the context and verify credentials before other hooks run | npm, git, github, gitlab |
| `discover`  | Find workspace packages and resolve their tags                   | npm, changelog           |
| `analyze`   | Classify commits and derive per-package releases                 | analyzer                 |
| `build`     | Compute versions, tag names, and release notes                   | builder, changelog       |
| `write`     | Write manifests and changelogs, then create the release commit   | changelog, npm, git      |
| `publish`   | Publish packages, push tags, and create hosting releases         | npm, git, github, gitlab |
| `finalize`  | Send notifications or clean up                                   | —                        |

Every hook is optional. A plugin typically implements only the hooks it needs.

The `finalize` hook is terminal: it runs on every workflow outcome. When a
phase hook throws, plugin rollbacks run while the error unwinds, then every
`finalize` handler still runs with the failure recorded on `context.outcome`.
The same applies when the workflow is cancelled between phases. Handlers can
use this to notify on both success and failure. When a `finalize` handler
itself throws, the remaining handlers still run and the error is reported as
a warning after the release report; a failing `finalize` handler never
changes the workflow outcome.

## Skipping steps

A plugin that cannot perform its work — most commonly because a credential is
missing — logs a warning and skips the work instead of failing:

```ts
async publish(context, next) {
  if (context.env.MY_TOKEN == null) {
    if (context.strict) {
      throw new Error('MY_TOKEN is required in strict mode.')
    }

    context.logger.warn('My releases will not be created: MY_TOKEN is required.')

    return next(context)
  }

  // ... perform the work
}
```

Log one warning per skipped step. Skips never change the release outcome: the
workflow completes, the exit code stays `0`, and the warnings appear in the
console output. Throw instead of skipping when `context.strict` is `true`, so
pipelines that require every step fail fast.

## Priorities

Within each hook, handlers run from higher priority to lower priority.
Handlers with equal priority retain their registration order.

```ts
HookPriority.High // 50
HookPriority.Normal // 0
HookPriority.Low // -50
```

For example, the changelog and npm plugins run at `Normal` priority in `write`,
while the Git plugin creates the release commit at `Low` priority. This lets
the release commit include changes made by earlier handlers.

## Authoring a plugin

A plugin is an object with a `name`, a `version`, and any hooks it needs. Each
handler receives `(context, next)`. Perform the plugin's work, then call
`next(context)` to continue the workflow.

```ts
// my-notify-plugin.ts
import { HookPriority, type ReleasePlugin } from 'reelout'

const notifyPlugin: ReleasePlugin = {
  name: 'notify',
  version: '1.0.0',
  finalize: {
    priority: HookPriority.Low,
    async handler(context, next) {
      const result =
        context.outcome?.status === 'failure' ? 'failed' : 'succeeded'
      const released = context.plans.filter((plan) => plan.release != null)
      context.logger.info(`Notifying ${released.length} release(s) (${result})`)
      await next(context)
    },
  },
}

export default notifyPlugin
```

Handlers may also be plain functions. The `context` is the `ReleaseContext`
created by `createContext`; it contains the working directory, environment,
repository and commit information, logger, resolved packages, and release
plans.

To accept options, export a factory that returns a plugin:

```ts
// my-notify-plugin.ts
import type { ReleasePlugin } from 'reelout'

export function createNotifyPlugin(options: {
  webhook: string
}): ReleasePlugin {
  return {
    name: 'notify',
    version: '1.0.0',
    async finalize(context, next) {
      context.logger.info(`Would POST to ${options.webhook}`)
      await next(context)
    },
  }
}
```

## Registering plugins

Reference your plugin in the `plugins` array of your [configuration](./02-config.md#plugins):

```ts
// reelout.config.ts
import { createNotifyPlugin } from './my-notify-plugin'

export default {
  plugins: [
    '@reelout/core/analyzer',
    '@reelout/core/builder',
    '@reelout/core/changelog',
    ['@reelout/npm', { access: 'public', provenance: true }],
    '@reelout/git',
    '@reelout/github',
    createNotifyPlugin({ webhook: 'https://example.com/hook' }),
  ],
}
```

ReelOut resolves string specifiers from the working directory first, so local
paths are supported. It then searches from `@reelout/config`, where the default
integration plugins are installed. Entries set to `false` or `null` are
discarded.

## Agent skill

This repository includes an agent skill for creating, extending, and reviewing
ReelOut plugins. It covers the plugin contract, lifecycle, priorities,
dry-run and rollback safety, registration, and testing. Install it into your
project with the [`skills`](https://skills.sh) CLI:

```sh
npx skills add reelout/reelout --skill create-reelout-plugin
```

The skill source lives at [`.agents/skills/create-reelout-plugin/SKILL.md`](https://github.com/reelout/reelout/blob/main/.agents/skills/create-reelout-plugin/SKILL.md).

## Built-in plugins

| Plugin    | Package                   | What it does                                                                                                                                        |
| --------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| analyzer  | `@reelout/core/analyzer`  | Classifies commits, plans package releases, and propagates dependency updates                                                                       |
| builder   | `@reelout/core/builder`   | Computes versions, tag names, and release notes                                                                                                     |
| changelog | `@reelout/core/changelog` | Resolves package tags and generates changelogs                                                                                                      |
| npm       | `@reelout/npm`            | Resolves the workspace, updates manifests and dependency ranges, and publishes packages, skipping versions already published with identical content |
| git       | `@reelout/git`            | Creates the release commit, pushes tags, and rolls back tags on failure                                                                             |
| github    | `@reelout/github`         | Creates GitHub releases, overwriting existing ones, and restores or removes them if a later step fails                                              |
| gitlab    | `@reelout/gitlab`         | Creates GitLab releases, overwriting existing ones, and restores or removes them if a later step fails                                              |

## Programmatic utilities

For programmatic use, `reelout` exports `createPlugin`, `HookManager`,
`HandlerMiddleware`, `HookPriority`, and `RELEASE_HOOK_NAMES`. See the
[Programmatic API](./05-api.md) guide or the
[API reference](https://reelout.overview.vercel.app/).
