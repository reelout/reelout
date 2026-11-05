---
name: write-reelout-plugin
description: 'Helps create, extend, and review ReelOut release plugins and hook handlers, including lifecycle, middleware, dry-run, rollback, registration, tests, and package setup.'
---

# Write a ReelOut Plugin

Use this skill to create, extend, or review a ReelOut release plugin. Plugins belong in the user's project—as a local module or workspace package—not in the ReelOut repository. Implement only the hooks needed for the plugin's behavior.

## Workflow

1. **Define the behavior.** Identify the plugin's purpose and the smallest set of lifecycle hooks that can implement it.
2. **Check the contract and prior art.** Read the [plugin guide](https://github.com/reelout/reelout/blob/main/docs/04-plugins.md), then inspect the installed `@reelout/core` sources:
   - `src/types.ts` for plugin, context, and hook types
   - `src/plugin/HookManager.ts` for priorities and middleware
   - `src/config/resolvePlugin.ts` for plugin resolution

   Find the package at `node_modules/@reelout/core` if installed directly, or under `node_modules/.pnpm/` if it is only a transitive dependency of `reelout`. Compare the closest built-in plugin in the [ReelOut repository](https://github.com/reelout/reelout):
   - `packages/git/src/git.ts` for Git side effects and rollback
   - `packages/github/src/github.ts` or `packages/gitlab/src/gitlab.ts` for remote APIs and tokens
   - `packages/core/src/changelog.ts` or `packages/npm/src/npm.ts` for file and package operations
   - `packages/core/src/analyzer.ts` for release planning

3. **Implement** the plugin using the contract and safety rules below.
4. **Test** it through the release workflow with the project's test runner.
5. **Verify** with focused tests and the project's lint command.

## Lifecycle and handlers

Hooks run in this order:

```text
configure → discover → analyze → build → write → publish → finalize
```

| Hook        | Purpose                                                       |
| ----------- | ------------------------------------------------------------- |
| `configure` | Adjust the context before other hooks run                     |
| `discover`  | Collect workspace packages and resolve package tags           |
| `analyze`   | Classify commits and derive per-package releases              |
| `build`     | Compute versions, tag names, and release notes                |
| `write`     | Write manifests and changelogs, and create the release commit |
| `publish`   | Publish packages, push tags, and create releases              |
| `finalize`  | Send notifications or clean up                                |

Every hook is optional. A handler receives `(context, next)` and participates in an asynchronous middleware chain:

```ts
const handler = async (context, next) => {
  // Perform this plugin's work.
  return await next(context)
}
```

- On a successful path, call `next(context)` exactly once. Omitting it stops the rest of the workflow—not just the current hook—yet the workflow can still resolve and report success. Repeated calls are guarded no-ops; do not rely on them.
- Higher `priority` values run first. A handler without an explicit priority uses `HookPriority.Normal` (`0`); use the object form to set one.
- Keep `write` handlers that create files at normal priority. The Git plugin commits at `HookPriority.Low` (`-50`) so earlier handlers' changes are included. `HookPriority.High` is `50`.
- If the plugin cannot safely continue, throw an actionable error identifying the missing prerequisite. The workflow aborts, records the failure, prints the release report, and rejects.

## Plugin contract and registration

Implement `ReleasePlugin` from `reelout`. Every plugin needs a `name` and `version`; use a factory when callers need to supply options or create independent instances. A plain plugin object is also valid.

```ts
import type { ReleasePlugin } from 'reelout'

/** Creates the plugin. */
const createMyPlugin = (): ReleasePlugin => ({
  name: 'my-plugin',
  version: '1.0.0',
  write: async (context, next) => {
    // Perform this plugin's work.
    return await next(context)
  },
})

export default createMyPlugin
```

Use `{ priority, handler }` instead of a bare handler when a hook needs a non-default priority. ReelOut's built-in plugins read `version` from their package manifest; third-party plugins can inline a literal or read their own manifest with JSON import attributes:

```ts
import pkg from './package.json' with { type: 'json' }
```

Register plugins in the ReelOut config's `plugins` array:

```ts
import createMyPlugin from './my-plugin'

export default {
  plugins: [
    '@reelout/core/analyzer',
    ['my-plugin', { webhook: 'https://example.com/hook' }],
    createMyPlugin(),
  ],
}
```

Resolution and registration rules:

- String specifiers resolve from the user's working directory first, then are retried relative to `@reelout/config`. The fallback resolves ReelOut's installed integration plugins.
- String specifiers may name an installed package or a local module path. Third-party packages must be installed in the user's project as a dependency or workspace package. The resolved module must be loadable by Node's ESM `import()`.
- A local file may instead be imported in the config and passed directly.
- The module's default export is unwrapped. A string-referenced module must default-export a plugin or its factory.
- Tuple entries pass their options to a factory. `false`, `null`, and `undefined` entries are discarded.

## Context and side-effect safety

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

Apply these rules to every handler:

- **Dry-run:** When `context.dryRun` is true, do not perform real side effects. Log the action that would have occurred with `context.logger.debug('[DRY RUN] ...')`. Read-only work may still run; use a collaborator's dry-run option when it is supported.
- **Prerequisites:** Validate only the repository and environment values required by the plugin, before starting side effects.
- **Rollback:** If a downstream handler can fail after this plugin creates external state, undo only effects owned by this plugin and rethrow the original error. Put the side effects and `next(context)` inside `try`/`catch`; use `Promise.allSettled` for best-effort cleanup when appropriate. Built-in plugins remove tags or releases they created.

## Package conventions

- Keep the plugin ESM-only (`"type": "module"`), target Node.js `>=24.15`, and do not use `require`.
- Import `ReleasePlugin` and any required runtime APIs (such as `HookPriority` or `executeReleaseWorkflow`) from `reelout`, which the project already depends on.
- Add JSDoc to exported functions, starting with a one-sentence summary.

## Tests and completion

Use the project's own test runner and drive the plugin through the release workflow:

- Run `executeReleaseWorkflow(context, [plugin()])` from `reelout` to exercise hook order, priority, error propagation, and report behavior.
- Build a `ReleaseContext` with the fields the handlers read. At minimum, provide `cwd`, `env`, `logger`, `dryRun`, and any `packages` or `plans` data the plugin inspects.
- For an integration-style test, use `createContext` from `reelout` in a temporary Git repository. It throws if the repository has no commits or no branch checked out.
- Mock collaborators, not the plugin itself, using the test runner's module-mocking facilities (for example, `vi.mock` in Vitest).
- Cover success, relevant failures, and dry-run behavior. If the plugin creates rollback-capable side effects, test cleanup when a downstream handler fails.
- Prefer assertions on mock calls and arguments; logger snapshots may contain ANSI color codes and can be unreliable outside a TTY.
- For end-to-end examples, see ReelOut's workflow-level tests, such as [`packages/gitlab/test/gitlab.test.ts`](https://github.com/reelout/reelout/blob/main/packages/gitlab/test/gitlab.test.ts).

Before finishing, confirm that successful handlers continue the chain once, failures report useful errors and clean up owned effects where applicable, exports and package metadata follow project conventions, and focused tests plus lint pass.
