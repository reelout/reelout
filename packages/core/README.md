# @reelout/core

Release engine for [ReelOut](https://github.com/reelout/reelout). This package
provides the plugin architecture, workflow executor, and shared Git,
versioning, and configuration utilities.

## Installation

```sh
npm install @reelout/core
```

This ESM-only package requires Node.js `>=24.15`.

## API

Key exports:

- **Workflow** — `executeReleaseWorkflow(context, plugins)` runs the release workflow.
- **Plugin system** — `HookManager`, `HookPriority`, `RELEASE_HOOK_NAMES`, `createPlugin`, `resolvePlugin`.
- **Built-in plugins** — default exports from `@reelout/core/analyzer`, `@reelout/core/builder`, and `@reelout/core/changelog`.
- **Versioning** — `bumpVersion`, `generateGitTagName`, `generateReleaseCommitMessage`, `buildReleaseNotes`.
- **Git** — `parseGitCommit`, `pushGitChanges`, `restoreFullGitHistory`, and `ensureGitTag`.
- **Configuration helpers** — `normalizeReleaseRule`, `normalizeCommitFilter`.
- **Types** — `ReleaseConfig`, `ReleaseContext`, `ReleasePlugin`, `ReleasePlan`, `ReleaseRule`.

```ts
import { executeReleaseWorkflow, type ReleasePlugin } from '@reelout/core'
```

## Documentation

- [Plugins guide](https://github.com/reelout/reelout/blob/main/docs/04-plugins.md)
- [Programmatic API guide](https://github.com/reelout/reelout/blob/main/docs/05-api.md)
- [API reference](https://reelout.overview.vercel.app/)
