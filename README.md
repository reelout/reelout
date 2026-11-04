# ReelOut

[![NPM Version](https://img.shields.io/npm/v/reelout)](https://www.npmjs.com/package/reelout)
[![Codecov](https://img.shields.io/codecov/c/github/reelout/reelout?token=FSP5JC9E16)](https://app.codecov.io/github/reelout/reelout)

ReelOut is a plugin-driven release automation tool for monorepos. It analyzes [Conventional Commits](https://conventionalcommits.org) to determine version bumps, update package manifests, generate changelogs, create tags, and publish packages to your registry.

## Features

| Feature                           |  Semantic Release  | Changesets | Release Please |      ReelOut       |
| :-------------------------------- | :----------------: | :--------: | :------------: | :----------------: |
| Monorepo support                  |         ❌         |     ✅     |       ✅       |         ✅         |
| No extra log files required       |         ✅         |     ❌     |       ✅       |         ✅         |
| No release pull requests required |         ✅         |     ✅     |       ❌       |         ✅         |
| Prerelease mode                   |         ✅         |     ✅     |       ✅       |         ✅         |
| Multi-ecosystem compatibility     | ✅ (plugin-driven) |     ❌     | ✅ (built-in)  | ✅ (plugin-driven) |

## Installation

Install with your preferred package manager:

```sh
npm install -D reelout
# or
pnpm add -D reelout
# or
yarn add -D reelout
```

## Quick Start

Preview a release first:

```sh
npx reelout --dry-run
```

When the preview looks right, run the release:

```sh
npx reelout
```

By default, ReelOut analyzes commits, updates package versions and changelogs, creates tags and a release commit, and publishes packages. See [Getting Started](./docs/getting-started.md) for prerequisites and details.

## CLI

View all available options:

```sh
npx reelout --help
```

```text
Usage: reelout [options]

Monorepo release CLI and toolkit.

Options:
  --type <string>                  Specify the release type, bypassing automatic commit analysis. (choices: "auto", "major", "minor", "patch")
  --qualifier <boolean or string>  Set or override the version qualifier (e.g., `alpha`, `beta`); pass `false` to disable.
  --channel <boolean or string>    Set or override the release channel (e.g., `stable`, `canary`); pass `false` to disable.
  --allow-empty                    Proceed with the release workflow even if no qualifying changes are detected.
  --dry-run                        Simulate the release workflow without modifying files or publishing artifacts.
  --debug                          Enable verbose logging for detailed troubleshooting. (default: false)
  -v, --version                    Display the version number.
  -h, --help                       Display command usage and options.
```

### Prereleases and channels

Ship pre-production builds with a version qualifier:

```sh
npx reelout --qualifier beta
```

Releasing from an `alpha`, `beta`, or `next` branch applies the matching qualifier and channel automatically. See [Configuration](./docs/config.md) to define custom branch rules.

## Documentation

- [Getting Started](./docs/getting-started.md) — install ReelOut, preview a release, and ship your first production version.
- [Configuration](./docs/config.md) — configure ReelOut for your monorepo.
- [Continuous Integration](./docs/ci.md) — run ReelOut in GitHub Actions and CircleCI.
- [Plugins](./docs/plugins.md) — extend ReelOut with custom release behavior.
- [Programmatic API](./docs/api.md) — use ReelOut as a library.
- [Troubleshooting](./docs/troubleshooting.md) — diagnose and resolve common problems.

Browse the full API reference at <https://reelout.overview.vercel.app/>.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and [CHANGELOG.md](./CHANGELOG.md) for release history.

## License

This project is licensed under the [MIT License](./LICENSE).
