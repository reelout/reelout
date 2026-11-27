# Plugins

Plugins handle release analysis, changelogs, publishing, tags, and release
notes. This guide explains the lifecycle and how to create a custom plugin.

## The release lifecycle

Plugins register middleware for named hooks, which run in this order:

```text
configure → discover → analyze → build → write → publish → finalize
```

| Hook        | Purpose                                                          | Built-in users                        |
| ----------- | ---------------------------------------------------------------- | ------------------------------------- |
| `configure` | Adjust the context and verify credentials before other hooks run | cargo, npm, yarn, git, github, gitlab |
| `discover`  | Find workspace packages and resolve their tags                   | cargo, npm, yarn, changelog           |
| `analyze`   | Classify commits and derive per-package releases                 | analyzer                              |
| `build`     | Compute versions, tag names, and release notes                   | builder, changelog                    |
| `write`     | Write manifests and changelogs, then create the release commit   | changelog, cargo, npm, yarn, git      |
| `publish`   | Publish packages, push tags, and create hosting releases         | cargo, npm, yarn, git, github, gitlab |
| `finalize`  | Send notifications or clean up                                   | —                                     |

Every hook is optional. A plugin typically implements only the hooks it needs.

The `finalize` hook is terminal: it runs on every workflow outcome. When a
phase hook throws, plugin rollbacks run while the error unwinds, then every
`finalize` middleware still runs with the failure recorded on
`context.outcome`. The same applies when the workflow is cancelled between
phases. Middleware can use this to notify on both success and failure. When a
`finalize` middleware itself throws, the remaining middleware still runs and
the error is reported as a warning after the release report; a failing
`finalize` middleware never changes the workflow outcome.

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

## Automatic activation

The default configuration includes every built-in plugin except the Yarn
plugin, and each integration decides at `configure` time whether it applies to
the repository:

| Plugin                            | Activates when                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------- |
| npm                               | The workspace root has a `package.json` and npm or pnpm is the active package manager |
| cargo                             | The workspace root has a `Cargo.toml`                                                 |
| github                            | The repository is hosted on GitHub                                                    |
| gitlab                            | The repository is hosted on GitLab                                                    |
| analyzer, builder, changelog, git | Always                                                                                |

The Yarn plugin is built-in but **opt-in**: it is not part of the default
configuration. Install `@reelout/yarn` and list `'@reelout/yarn'` in
[`plugins`](./02-config.md#plugins); it activates when the workspace's active
package manager is Yarn (Classic or Berry). On Yarn workspaces the npm plugin
stays inactive, so packages publish through Yarn instead.

Hosting plugins read the repository from the `origin` remote; a `repository`
field declared in the root manifest takes precedence. A plugin that does not
apply stays **inactive** for the run: it logs its inactivity at `debug`
level, verifies no credentials, and makes no network requests or file
changes. Inactivity is enablement, not a skipped step, so `--strict` does
not turn it into an error.

Mixed repositories activate more than one integration: a JavaScript workspace
that also keeps a `Cargo.toml` publishes npm packages and crates, so a missing
`CARGO_REGISTRY_TOKEN` warns — or fails under `--strict` — even when the
crates are incidental. Override [`plugins`](./02-config.md#plugins) to remove
the unwanted integration in that case.

Credential skipping is different: an **active** plugin that lacks its token
skips its step, and `--strict` fails the run instead (see
[Skipping steps](#skipping-steps)). npm and cargo announce the skip with a
warning; the github and gitlab hosting plugins log it at `debug` level.

## Priorities

Within each hook, middleware run from higher priority to lower priority.
Middleware with equal priority retain their registration order.

```ts
Priority.High // 50
Priority.Normal // 0
Priority.Low // -50
```

For example, the changelog and npm plugins run at `Normal` priority in `write`,
while the Git plugin creates the release commit at `Low` priority. This lets
the release commit include changes made by earlier middleware.

## Authoring a plugin

A plugin is an object with a `name`, a `version`, and any hooks it needs. Each
middleware receives `(context, next)`. Perform the plugin's work, then call
`next(context)` to continue the workflow.

```ts
// my-notify-plugin.ts
import { Priority, type ReleasePlugin } from 'reelout'

const notifyPlugin: ReleasePlugin = {
  name: 'notify',
  version: '1.0.0',
  finalize: {
    priority: Priority.Low,
    async middleware(context, next) {
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

Middleware may also be plain functions. The `context` is the `ReleaseContext`
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
    '@reelout/npm',
    '@reelout/cargo',
    '@reelout/git',
    '@reelout/github',
    '@reelout/gitlab',
    createNotifyPlugin({ webhook: 'https://example.com/hook' }),
  ],
}
```

ReelOut resolves string specifiers from the working directory first, so local
paths are supported. It then searches from `@reelout/config`, where the default
integration plugins are installed. The opt-in `@reelout/yarn` plugin is not
installed through `@reelout/config`; install it in your project before
referencing it. Entries set to `false` or `null` are discarded. A module whose
default export is neither a function nor an object with a string `name` is
ignored as well, so a plugin with an invalid shape is silently dropped rather
than failing the run.

## Agent skill

This repository includes an agent skill for creating, extending, and reviewing
ReelOut plugins. It covers the plugin contract, lifecycle, priorities,
dry-run and rollback safety, registration, and testing. Install it into your
project with the [`skills`](https://skills.sh) CLI:

```sh
npx skills add reelout/reelout --skill create-reelout-plugin
```

The skill source lives at [`.agents/skills/create-reelout-plugin/SKILL.md`](https://github.com/reelout/reelout/blob/main/.agents/skills/create-reelout-plugin/SKILL.md).

The repository tracks eight skills under `.agents/skills/`. Four of them
(`commit-and-review`, `commit-review-and-merge`, `merge-pull-request`, and
`test-naming`) are synced from the
[`reelout/skills`](https://github.com/reelout/skills) repository and pinned in
`skills-lock.json`; the remaining four are maintained locally in this
repository and are intentionally not part of the lock.

## Built-in plugins

| Plugin    | Package                   | What it does                                                                                                                                                                          |
| --------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| analyzer  | `@reelout/core/analyzer`  | Classifies commits, plans package releases, and propagates dependency updates                                                                                                         |
| builder   | `@reelout/core/builder`   | Computes versions, tag names, and release notes                                                                                                                                       |
| changelog | `@reelout/core/changelog` | Resolves package tags and generates changelogs                                                                                                                                        |
| npm       | `@reelout/npm`            | Resolves the workspace, updates manifests and dependency ranges, and publishes packages, skipping versions already published with identical content                                   |
| yarn      | `@reelout/yarn`           | Resolves Yarn workspaces (Classic and Berry), updates manifests and dependency ranges, and publishes packages with staged-publishing support; **opt-in**                              |
| cargo     | `@reelout/cargo`          | Resolves the Cargo workspace, updates manifests and dependency requirements, refreshes `Cargo.lock`, and publishes crates, skipping versions already published with identical content |
| git       | `@reelout/git`            | Creates the release commit, pushes tags, and rolls back tags on failure                                                                                                               |
| github    | `@reelout/github`         | Creates GitHub releases, overwriting existing ones, and restores or removes them if a later step fails                                                                                |
| gitlab    | `@reelout/gitlab`         | Creates GitLab releases, overwriting existing ones, and restores or removes them if a later step fails                                                                                |

## Programmatic utilities

For programmatic use, `reelout` exports `createPlugin`, `HookDispatcher`,
`Interceptor`, `Priority`, and `RELEASE_HOOK_NAMES`. See the
[Programmatic API](./05-api.md) guide or the
[API reference](https://reelout.overview.vercel.app/).

`@reelout/core` also exports `createHostReleasePlugin`, the shared skeleton
behind the `github` and `gitlab` plugins. It handles host detection, token
reading and verification, dry-run behavior, publish ordering, and rollback
wiring, so a plugin for another git host only needs to provide the host
client calls:

```ts
import { createHostReleasePlugin } from '@reelout/core'

const gitea = () =>
  createHostReleasePlugin({
    name: 'my-gitea-plugin',
    version: '1.0.0',
    host: 'gitea',
    displayName: 'Gitea',
    tokenEnvKey: 'GITEA_TOKEN',
    verifyToken,
    createRelease,
  })
```
