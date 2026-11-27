# Programmatic API

This document is the single source of truth for the `reelout` root package's
public API surface and is maintained by hand. The generated API reference
(`pnpm exec typedoc`) covers the workspace packages only, so changes to what
the root package re-exports must be reflected here.

The `reelout` package re-exports a curated set of APIs from `@reelout/cli`,
`@reelout/config`, `@reelout/context`, and `@reelout/core`. Import integration
plugins such as `@reelout/npm`, `@reelout/yarn`, `@reelout/cargo`,
`@reelout/git`, `@reelout/github`, and `@reelout/gitlab` from their respective
packages, and import further building blocks directly from the package that
provides them.

ReelOut is ESM-only and requires Node.js >= 24.15.

## Running a release

The CLI combines resolved configuration, a release context, instantiated
plugins, and the workflow executor. This example runs that workflow in dry-run
mode:

```ts
// run-release.ts
import {
  createContext,
  createPlugin,
  executeReleaseWorkflow,
  resolveConfig,
  type ReleasePlugin,
} from 'reelout'

const cwd = process.cwd()

const config = await resolveConfig(cwd)

const context = await createContext({
  ...config,
  cwd,
  env: process.env,
  stdout: process.stdout,
  stderr: process.stderr,
  dryRun: true,
})

const plugins: ReleasePlugin[] = []
for (const definition of config.plugins) {
  const plugin = await createPlugin(definition)
  if (plugin) plugins.push(plugin)
}

await executeReleaseWorkflow(context, plugins)
```

`createContext` accepts the options the CLI derives from flags: `filter`,
`type`, `qualifier`, `channel`, `allowEmpty`, `dryRun`, `strict`, and `debug`.
Pass an optional `signal` (`AbortSignal`) to cancel the workflow. Set
`dryRun: false` or omit it to perform a real release. Pass `strict: true` to
turn missing-credential skipping into errors, matching the CLI's `--strict`
flag.

## Resolving configuration

```ts
import { resolveConfig, defaultConfig, mergeConfig } from 'reelout'

// Discover configuration, merge it over defaults, and normalize it
const config = await resolveConfig(process.cwd())

// Or merge a configuration object manually
const merged = mergeConfig(defaultConfig, {
  classifier: { major: [], minor: ['feat'], patch: ['fix'] },
})
```

See the [Configuration](./02-config.md) guide for the config format and defaults.

## Building a custom CLI

`createProgram` creates the Commander program used by the `reelout` binary. Use
it to embed the CLI in another application or customize its name and metadata:

```ts
// my-cli.ts
import { createProgram, createProcessAbortSignal } from 'reelout'

const program = await createProgram({
  name: 'my-release-cli',
  version: '1.0.0',
  description: 'Custom release CLI powered by ReelOut',
  cwd: process.cwd(),
  env: process.env,
  stdout: process.stdout,
  stderr: process.stderr,
  signal: createProcessAbortSignal(),
})

await program.parseAsync(process.argv)
```

`createProcessAbortSignal` returns an `AbortSignal` that fires on `SIGINT` or
`SIGTERM`. When the signal fires between phases, the workflow stops, still runs
`finalize` middleware for cleanup, and rejects with a cancellation error.

## Standalone utilities

The re-exported packages expose the workflow's building blocks, which you can use independently:

- **Versioning** — `bumpVersion`, `generateGitTagName`, `generateReleaseCommitMessage`, `buildReleaseNotes`
- **Git** — `parseGitCommit`, `pushGitChanges`, `restoreFullGitHistory`, `readGitHistory`
- **Plugin system** — `HookDispatcher`, `Interceptor`, `Priority`, `RELEASE_HOOK_NAMES`, `createPlugin`
- **npm** (from `@reelout/npm`) — `readPackageJson`, `writePackageJson`, `resolveWorkspaceMembers`, `prepareAuth`, `publishPackage`

Browse the full surface in the [API reference](https://reelout.overview.vercel.app/).
