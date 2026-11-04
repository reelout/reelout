# @reelout/cli

Command-line interface for [ReelOut](https://github.com/reelout/reelout), a plugin-driven release automation toolkit for monorepos. This package implements the Commander program behind the `reelout` executable and the factory for creating its Commander program.

## Installation

```sh
npm install @reelout/cli
```

This ESM-only package requires Node.js >= 24.15.

## API

- `createProgram(options)` — create the Commander program with the release workflow configured.
- `createProcessAbortSignal()` — create an `AbortSignal` that fires on `SIGINT` or `SIGTERM`.

```ts
import { createProgram, createProcessAbortSignal } from '@reelout/cli'

const program = await createProgram({
  name: 'reelout',
  version: '1.0.0',
  description: 'Monorepo release CLI and toolkit.',
  cwd: process.cwd(),
  env: process.env,
  stdout: process.stdout,
  stderr: process.stderr,
  signal: createProcessAbortSignal(),
})

await program.parseAsync(process.argv)
```

## Documentation

- [Guides](https://github.com/reelout/reelout/tree/main/docs)
- [API reference](https://reelout.overview.vercel.app/)
