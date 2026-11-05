---
name: write-reelout-plugin
description: 'Helps create, extend, and review ReelOut release plugins and hook handlers, including lifecycle, middleware, dry-run, rollback, registration, tests, and package setup.'
---

# Write a ReelOut Plugin

Use this skill to create, extend, or review a ReelOut release plugin. A plugin belongs to the user's project—as a local module imported by the ReelOut config or as a package in the user's workspace—not to the ReelOut repository. Each plugin implements only the lifecycle hooks it needs.

## Workflow

1. **Define the behavior.** Identify the plugin's purpose and the smallest set of hooks that can implement it.
2. **Check the contract and prior art.** Read the [plugin guide](https://reelout.overview.vercel.app/documents/plugins.html), then inspect the installed `@reelout/core` sources:
   - `src/types.ts` for plugin and hook types
   - `src/plugin/HookManager.ts` for priorities and middleware
   - `src/config/resolvePlugin.ts` for plugin registration

   Find the package at `node_modules/@reelout/core` if installed directly, or under `node_modules/.pnpm/` if it is only a transitive dependency of `reelout`. Then compare the closest built-in plugin in the [ReelOut repository](https://github.com/reelout/reelout):
   - `packages/git/src/git.ts` for Git side effects and rollback
   - `packages/github/src/github.ts` or `packages/gitlab/src/gitlab.ts` for remote APIs and tokens
   - `packages/core/src/changelog.ts` or `packages/npm/src/npm.ts` for file and package operations
   - `packages/core/src/analyzer.ts` for release planning

3. **Implement** the plugin using the contract, safety rules, and package conventions below.
4. **Test** it through the release workflow with the project's test runner.
5. **Verify** focused tests and the project's lint command.

## Plugin contract and registration

Implement `ReleasePlugin` from `reelout`, the package the project already depends on. Every plugin needs a `name` and `version`; use a factory when callers need to pass options or create independent instances. A plain plugin object is also valid.

```ts
import type { ReleasePlugin } from 'reelout'

/** Creates the plugin. */
const myPlugin = (): ReleasePlugin => ({
  name: 'my-plugin',
  version: '1.0.0',
  // Add only the hooks this plugin needs.
})

export default myPlugin
```

ReelOut's built-in plugins read `version` from their package manifest. A third-party plugin can use a literal or read its own manifest with JSON import attributes:

```ts
import pkg from './package.json' with { type: 'json' }
```

Register plugins in the ReelOut config's `plugins` array:

```ts
import myPlugin from './my-plugin'

export default {
  plugins: [
    '@reelout/core/analyzer',
    ['my-plugin', { webhook: 'https://example.com/hook' }],
    myPlugin(),
  ],
}
```

Registration behavior:

- String specifiers resolve from the user's working directory, then are retried relative to `@reelout/config`. The fallback resolves only ReelOut's integration plugins.
- A third-party plugin referenced by string must be installed in the user's project as a dependency or workspace package. String loading uses ESM `import()`, so the package entry must be Node-importable.
- Import a local plugin file and pass it directly in the config; do not reference it with a string path.
- String-referenced modules must default-export the plugin or its factory. The module's default export is unwrapped.
- Tuple entries pass their options to a factory. `false` and `null` entries are discarded.

## Lifecycle and middleware

Hooks run in this order:

```text
configure → discover → analyze → build → write → publish → finalize
```

| Hook        | Purpose                                                       |
| ----------- | ------------------------------------------------------------- |
| `configure` | Adjust context before other hooks run                         |
| `discover`  | Collect workspace packages and resolve package tags           |
| `analyze`   | Classify commits and derive per-package releases              |
| `build`     | Compute versions, tag names, and release notes                |
| `write`     | Write manifests and changelogs, and create the release commit |
| `publish`   | Publish packages, push tags, and create releases              |
| `finalize`  | Send notifications or clean up                                |

Every hook is optional. A handler receives `(context, next)` and joins an asynchronous middleware chain:

```ts
const handler = async (context, next) => {
  // Do this plugin's work.
  return await next(context)
}
```

- On a successful path, call `next(context)` exactly once. Omitting it skips the remaining handlers for that hook, although the workflow continues to the next hook. A repeated call is a guarded no-op; do not rely on it.
- Higher `priority` values run first. Use the object form to set a non-default priority; otherwise the handler uses `HookPriority.Normal` (`0`).
- Keep `write` handlers that create files at normal priority. The Git plugin creates the release commit at `HookPriority.Low` (`-50`) so it includes earlier handlers' changes. `HookPriority.High` is `50`.
- If the plugin cannot safely continue, throw an actionable error that identifies the missing prerequisite. The workflow aborts, records the failure, prints the release report, and rejects.

Use `HookPriority` when a non-default priority is required:

```ts
import { HookPriority, type ReleasePlugin } from 'reelout'

/** Creates the plugin with a low-priority write handler. */
const myPlugin = (): ReleasePlugin => ({
  name: 'my-plugin',
  version: '1.0.0',
  write: {
    priority: HookPriority.Low,
    handler: async (context, next) => {
      return await next(context)
    },
  },
})
```

## Context and side effects

Handlers receive a mutable `ReleaseContext`. Commonly used fields:

| Fields                                                     | Meaning                                                                                                   |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `cwd`, `env`, `signal`                                     | Working directory, environment variables, and optional abort signal                                       |
| `logger`                                                   | `ConsolaInstance`; use `logger.debug` for verbose details                                                 |
| `repository`                                               | `GitRepository \| null`; check before making host API calls                                               |
| `ref`, `commit`, `author`                                  | Current branch, HEAD commit, and release commit author                                                    |
| `dryRun`                                                   | Whether the workflow must avoid real side effects                                                         |
| `packages`, `plans`                                        | Resolved packages and their `ReleasePlan`s; `plan.release` is `null` until a release is derived and built |
| `type`, `versionQualifier`, `releaseChannel`, `allowEmpty` | Resolved CLI overrides                                                                                    |

Follow these safety rules:

- **Dry-run:** When `context.dryRun` is true, do not perform real side effects. Log what would happen with `context.logger.debug('[DRY RUN] ...')`. Read-only work may still run; use a collaborator's dry-run option when that is its established interface.
- **Prerequisites:** Validate the repository and environment values required by the plugin before starting side effects. Keep checks specific to the operations being performed.
- **Rollback:** If a later handler can fail after this plugin creates external state, undo only effects owned by this plugin and rethrow the original error. Put the relevant side effects and `next(context)` inside `try`/`catch`; use `Promise.allSettled` for best-effort cleanup when appropriate. Built-in plugins remove tags or releases they created.

## Package conventions

- Keep the plugin ESM-only (`"type": "module"`), target Node.js `>=24.15`, and do not use `require`.
- Import `ReleasePlugin`, `HookPriority`, and `executeReleaseWorkflow` from `reelout` as needed; the project already depends on it.
- Add JSDoc to exported functions, starting with a one-sentence summary.

## Tests and completion

Use the project's own test runner and drive the plugin through the release workflow:

- Run `executeReleaseWorkflow(context, [plugin()])` from `reelout` to exercise hook order, priority, error propagation, and report behavior.
- Build a `ReleaseContext` with the fields the handlers read. At minimum, provide `cwd`, `env`, `logger`, `dryRun`, and any `packages` or `plans` data the plugin inspects.
- For an integration-style test, use `createContext` from `reelout` inside a temporary Git repository. It throws if the directory has no commits or no branch checked out.
- Mock collaborators, not the plugin itself, with the test runner's module-mocking facilities (for example, `vi.mock` in Vitest).
- Cover the successful path and relevant failure and dry-run paths. If the plugin creates rollback-capable side effects, test cleanup when a downstream handler fails.
- Prefer assertions on mock calls and arguments. Logger snapshots can contain ANSI color codes and may be unreliable outside a TTY.
- For end-to-end examples, see ReelOut's workflow-level tests, such as [`packages/gitlab/test/gitlab.test.ts`](https://github.com/reelout/reelout/blob/main/packages/gitlab/test/gitlab.test.ts).

Before finishing, confirm that successful handlers continue the chain once, failure paths report useful errors and clean up owned effects where applicable, exports and package metadata follow project conventions, and focused tests plus lint pass.
