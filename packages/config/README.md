# @reelout/config

Configuration loading for [ReelOut](https://github.com/reelout/reelout). This package discovers files with [cosmiconfig](https://github.com/cosmiconfig/cosmiconfig), merges their contents with the defaults, and normalizes the result.

## Installation

```sh
npm install @reelout/config
```

This ESM-only package requires Node.js >= 24.15.

## API

- `resolveConfig(cwd, name?)` — find configuration for a directory, merge it with the defaults, and normalize it.
- `defaultConfig` — the built-in default configuration.
- `mergeConfig(defaults, config)` — merge user configuration over defaults.
- `normalizeConfig(cwd, config)` — normalize a configuration object, including its author, rules, and plugins.

```ts
import { resolveConfig } from '@reelout/config'

const config = await resolveConfig(process.cwd())
```

## Documentation

- [Configuration guide](https://github.com/reelout/reelout/blob/main/docs/02-config.md)
- [Guides](https://github.com/reelout/reelout/tree/main/docs)
- [API reference](https://reelout.overview.vercel.app/)
