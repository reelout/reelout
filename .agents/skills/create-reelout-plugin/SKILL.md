---
name: create-reelout-plugin
description: 'Helps create, extend, and review ReelOut release plugins and hook middleware, including lifecycle, dry-run, rollback, registration, tests, and package setup.'
---

# Create a ReelOut Plugin

Use this skill to create, extend, or review a ReelOut release plugin in the
consumer's project. Keep the plugin there—as a local module or workspace
package—not in the ReelOut repository. Implement only the hooks required by
the plugin's behavior.

## Workflow

1. **Define the behavior.** State what the plugin must do and select the
   smallest set of lifecycle hooks that can do it.
2. **Verify the contract and find prior art.** Read the
   [plugin guide](https://github.com/reelout/reelout/blob/main/docs/04-plugins.md)
   and inspect the installed `@reelout/core` sources:
   - `src/types.ts` for plugin, context, and hook types
   - `src/plugin/HookDispatcher.ts` for middleware and priorities
   - `src/config/resolvePlugin.ts` for plugin resolution

   Find the package under `node_modules/@reelout/core` or, for a transitive
   dependency, under `node_modules/.pnpm/`. Compare it with the closest
   built-in plugin in the [ReelOut repository](https://github.com/reelout):
   - `packages/git/src/git.ts` for Git side effects and rollback
   - `packages/github/src/github.ts` or `packages/gitlab/src/gitlab.ts` for
     remote APIs and tokens
   - `packages/core/src/changelog.ts` or `packages/npm/src/npm.ts` for file
     and package operations
   - `packages/core/src/analyzer.ts` for release planning

3. **Implement** the plugin using the contract and side-effect rules below.
4. **Test** it through the release workflow. Cover success, relevant failures,
   and dry-run behavior, then run focused tests and the project's lint command.

## Plugin contract and registration

Implement `ReleasePlugin` from `reelout`. Every plugin must provide a `name`
and `version`; each hook is optional. Use a factory when callers need options
or independent instances. A plain plugin object is also valid.

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

Use `{ priority, middleware }` instead of a bare middleware function when a hook needs a
non-default priority. ReelOut's built-in plugins read `version` from their
package manifest. A third-party plugin can inline its version or read it from
its own manifest with JSON import attributes:

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

Resolution rules:

- String specifiers are resolved from the user's working directory using
  Node's module resolution. A string can identify an installed package or a
  local module path; make sure third-party packages are available to the
  user's project as dependencies or workspace packages.
- The resolved module must load through Node's ESM `import()`. A
  string-referenced module must default-export a plugin object or factory;
  its default export is unwrapped during resolution.
- To use a local file directly, import it in the config and pass the plugin
  object or factory.
- Tuple entries pass their options to a factory. `false`, `null`, and
  `undefined` entries are ignored.

## Lifecycle and middleware

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
| `finalize`  | Notify or clean up                                            |

Every hook is optional. Middleware receives `(context, next)` and
participates in an asynchronous middleware chain:

```ts
const middleware = async (context, next) => {
  // Perform this plugin's work.
  return await next(context)
}
```

- On the successful path, call `next(context)` exactly once. Omitting it
  short-circuits the remaining hooks and phases without throwing, so the
  workflow can still report success. Repeated calls are no-ops; do not rely
  on them.
- Higher priority values run first. Bare middleware uses
  `Priority.Normal` (`0`); use `{ priority, middleware }` to set another
  priority.
- Keep `write` middleware that create files at normal priority. The Git plugin
  commits at `Priority.Low` (`-50`) so earlier middleware's changes are
  included. `Priority.High` is `50`.
- If the plugin cannot safely continue, throw an actionable error naming the
  missing prerequisite. The workflow stops, runs `finalize`, prints the
  report, and then rejects with the failure.
- `finalize` runs for success, failure, and cancellation. Use
  `context.outcome` (`status`, `error`, and `phase`) to choose cleanup or
  notifications. If a `finalize` middleware throws, its error is logged as a
  warning after the report; it does not stop other `finalize` middleware or
  change the workflow outcome.

## Repository-scoped activation

A plugin that applies only to some repositories should detect applicability in
`configure` and stay inactive for the rest of the run. ReelOut's built-in npm,
Cargo, GitHub, and GitLab plugins follow this pattern using helpers exported
from `reelout`:

```ts
import {
  isPluginInactive,
  markPluginInactive,
  type ReleasePlugin,
} from 'reelout'

const createMyPlugin = (): ReleasePlugin => ({
  name: 'my-plugin',
  version: '1.0.0',
  configure: async (context, next) => {
    if (!appliesTo(context)) {
      markPluginInactive(context, 'my-plugin')
      context.logger.debug('My releases will not be created: not applicable.')

      return next(context)
    }

    return next(context)
  },
  publish: async (context, next) => {
    if (isPluginInactive(context, 'my-plugin')) {
      context.logger.debug('My publishing was skipped: not applicable.')

      return next(context)
    }

    // ... perform the work
    return next(context)
  },
})
```

Rules:

- Gate first in `configure`, before credential checks, token verification, or
  network calls.
- Check `isPluginInactive(context, name)` in later hooks instead of keeping a
  local flag: the workflow resets activity before each run, so local state can
  go stale across runs.
- Log inactivity at `debug` level. Inactivity is enablement, not a skipped
  step: never warn for it and never escalate it under `--strict`. Reserve
  warn-and-skip (or the strict throw) for a plugin that applies but lacks
  credentials.
- The workflow logs an `Active plugins: ...` summary once configuration
  completes.

## Context and side-effect safety

Middleware receives a mutable `ReleaseContext`. Commonly used fields:

| Fields                                                     | Meaning                                                                                                   |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `cwd`, `env`, `signal`                                     | Working directory, environment, and optional abort signal                                                 |
| `logger`                                                   | `ConsolaInstance`; use `logger.debug` for verbose details                                                 |
| `repository`                                               | `GitRepository \| null`; check before making host API calls                                               |
| `ref`, `commit`, `author`                                  | Current branch, HEAD commit, and release commit author                                                    |
| `dryRun`                                                   | Whether the workflow must avoid real side effects                                                         |
| `packages`, `plans`                                        | Resolved packages and their `ReleasePlan`s; `plan.release` is `null` until a release is derived and built |
| `outcome`                                                  | `ReleaseOutcome \| null`; set before `finalize`, with status, error, and failing phase                    |
| `type`, `versionQualifier`, `releaseChannel`, `allowEmpty` | Resolved CLI overrides                                                                                    |

Apply these rules to all middleware:

- **Dry runs:** If `context.dryRun` is true, do not perform real side effects.
  Log the intended action with `context.logger.debug('[DRY RUN] ...')`.
  Read-only work may continue; use a collaborator's dry-run option when
  available.
- **Prerequisites:** Validate the repository and environment values the
  plugin actually needs before starting side effects.
- **Rollback:** If downstream work can fail after the plugin creates external
  state, undo only effects owned by the plugin and rethrow the original error.
  Put both the side effects and `next(context)` inside `try`/`catch`; use
  `Promise.allSettled` for best-effort cleanup when appropriate. Built-in
  plugins remove tags or releases they created.

## Package conventions

- Keep the plugin ESM-only (`"type": "module"`), target Node.js `>=24.15`, and
  use ESM imports rather than `require`.
- Import `ReleasePlugin` and any required runtime APIs (such as `Priority`
  or `executeReleaseWorkflow`) from `reelout`, which the project already
  depends on.
- Add JSDoc to exported functions, beginning with a one-sentence summary.

## Tests and completion

Exercise the plugin through the release workflow using the project's test
runner:

- Use `executeReleaseWorkflow(context, [plugin()])` from `reelout` to test
  hook order, priority, error propagation, finalization, and reporting.
- For unit tests, build a `ReleaseContext` with every field the middleware
  reads.
  At minimum, provide `cwd`, `env`, `logger`, `dryRun`, and any `packages` or
  `plans` data it inspects.
- For an integration-style test, use `createContext` from `reelout` with a
  temporary Git repository. It requires at least one commit and a checked-out
  branch.
- Mock collaborators—not the plugin itself—with the test runner's module
  mocking facilities (for example, `vi.mock` in Vitest).
- Cover success, relevant failures, and dry-run behavior. If the plugin
  creates rollback-capable side effects, verify cleanup when downstream work
  fails.
- Prefer assertions on mock calls and arguments. Logger snapshots may contain
  ANSI color codes and can be unreliable outside a TTY.
- For workflow-level examples, see
  [`packages/gitlab/test/gitlab.test.ts`](https://github.com/reelout/reelout/blob/main/packages/gitlab/test/gitlab.test.ts).

Before finishing, confirm that successful middleware continue the chain once,
failures report actionable errors, owned side effects are cleaned up where
applicable, and exports and package metadata follow project conventions.
