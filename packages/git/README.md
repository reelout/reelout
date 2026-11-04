# @reelout/git

Git integration plugin for [ReelOut](https://github.com/reelout/reelout). It creates the release commit and pushes tags, removing tags it created if the release fails.

## Installation

The `reelout` CLI installs this plugin through `@reelout/config`. Install it separately only when using it outside the CLI.

```sh
npm install @reelout/git
```

This ESM-only package requires Node.js >= 24.15.

## Usage

Reference the plugin in your ReelOut configuration:

```ts
export default {
  plugins: [
    '@reelout/core/analyzer',
    '@reelout/core/builder',
    '@reelout/core/changelog',
    '@reelout/npm',
    '@reelout/git',
  ],
}
```

The default export is the plugin itself:

```ts
import { git } from '@reelout/git'
```

## Documentation

- [Getting Started guide](https://github.com/reelout/reelout/blob/main/docs/getting-started.md)
- [Configuration guide](https://github.com/reelout/reelout/blob/main/docs/config.md)
- [API reference](https://reelout.overview.vercel.app/)
