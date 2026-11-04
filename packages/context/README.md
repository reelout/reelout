# @reelout/context

Release execution context for [ReelOut](https://github.com/reelout/reelout). This package creates the `ReleaseContext` used by the workflow and its plugins, including repository and commit details, branch rules, a logger, and release plans.

## Installation

```sh
npm install @reelout/context
```

This ESM-only package requires Node.js >= 24.15.

## API

- `createContext(options)` — resolve the repository, current commit, and branch; apply release rules; and create a context for `executeReleaseWorkflow`. `options` combines a resolved release configuration (from `resolveConfig`) with runtime options such as `cwd`, `env`, `stdout`, `stderr`, and `dryRun`.

```ts
import { resolveConfig } from '@reelout/config'
import { createContext } from '@reelout/context'

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
```

## Documentation

- [Programmatic API guide](https://github.com/reelout/reelout/blob/main/docs/api.md)
- [Guides](https://github.com/reelout/reelout/tree/main/docs)
- [API reference](https://reelout.overview.vercel.app/)
