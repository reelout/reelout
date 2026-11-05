# @reelout/git

Git integration plugin for [ReelOut](https://github.com/reelout/reelout). It
creates the release commit, pushes tags, and removes tags it created if a later
release step fails.

## Installation

The `reelout` CLI includes this plugin through `@reelout/config`. Install it
separately only when using it outside the CLI.

```sh
npm install @reelout/git
```

This ESM-only package requires Node.js `>=24.15`.

## Usage

Add the plugin to the `plugins` array in your ReelOut configuration:

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
import git from '@reelout/git'
```

## Documentation

- [Getting started](https://github.com/reelout/reelout/blob/main/docs/01-getting-started.md)
- [Configuration](https://github.com/reelout/reelout/blob/main/docs/02-config.md)
- [API reference](https://reelout.overview.vercel.app/)
