# @reelout/core

Release engine for [ReelOut](https://github.com/reelout/reelout), providing the plugin architecture, workflow executor, and Git, versioning, and configuration utilities used across the `@reelout/*` packages.

## Installation

```sh
npm install @reelout/core
```

This ESM-only package requires Node.js >= 24.15.

## API

Key exports include:

- **Workflow** — `executeReleaseWorkflow(context, plugins)` runs the release workflow.
- **Plugin system** — `HookManager`, `HookPriority`, `RELEASE_HOOK_NAMES`, `createPlugin`, `resolvePlugin`.
- **Built-in plugins** — available as the default exports of `@reelout/core/analyzer`, `@reelout/core/builder`, and `@reelout/core/changelog`.
- **Versioning** — `bumpVersion`, `generateGitTagName`, `generateReleaseCommitMessage`, `buildReleaseNotes`.
- **Git** — `parseGitCommit`, `pushGitChanges`, `restoreFullGitHistory`, and `ensureGitTag`.
- **Configuration helpers** — `normalizeReleaseRule`, `normalizeCommitFilter`.
- **Types** — `ReleaseConfig`, `ReleaseContext`, `ReleasePlugin`, `ReleasePlan`, `ReleaseRule`.

```ts
import { executeReleaseWorkflow, type ReleasePlugin } from '@reelout/core'
```

## Documentation

- [Plugins guide](https://github.com/reelout/reelout/blob/main/docs/plugins.md)
- [Programmatic API guide](https://github.com/reelout/reelout/blob/main/docs/api.md)
- [Guides](https://github.com/reelout/reelout/tree/main/docs)
- [API reference](https://reelout.overview.vercel.app/)
