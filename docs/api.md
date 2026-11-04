# Programmatic API

The `reelout` package re-exports the APIs from `@reelout/cli`, `@reelout/config`, `@reelout/context`, and `@reelout/core`. Import integration plugins such as `@reelout/npm`, `@reelout/git`, `@reelout/github`, and `@reelout/gitlab` from their respective packages.

ReelOut is ESM-only and requires Node.js >= 24.15.

## Running a release

The CLI combines a resolved configuration, a release context, instantiated plugins, and the workflow executor. The following example runs the same workflow in dry-run mode:

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

`createContext` accepts the options the CLI derives from flags—`type`, `qualifier`, `channel`, `allowEmpty`, `dryRun`, and `debug`—as well as an optional `signal` (`AbortSignal`) for cancellation. Set `dryRun: false` or omit it to perform a real release.

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

See the [Configuration](./config.md) guide for the config format and defaults.

## Building a custom CLI

`createProgram` creates the Commander program used by the `reelout` binary. Use it to embed the CLI in another application or customize its identity:

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

`createProcessAbortSignal` returns an `AbortSignal` that fires on `SIGINT` or `SIGTERM`, allowing the workflow to clean up gracefully.

## Standalone utilities

The re-exported packages expose the workflow's building blocks, which you can use independently:

- **Versioning** — `bumpVersion`, `generateGitTagName`, `generateReleaseCommitMessage`, `buildReleaseNotes`
- **Git** — `parseGitCommit`, `pushGitChanges`, `restoreFullGitHistory`, `showGitHistory`
- **Plugin system** — `HookManager`, `HookPriority`, `RELEASE_HOOK_NAMES`, `createPlugin`
- **npm** (from `@reelout/npm`) — `readPackageJson`, `writePackageJson`, `resolveWorkspaceMembers`, `prepareAuth`, `publishPackage`

Browse the full surface in the [API reference](https://reelout.overview.vercel.app/).
