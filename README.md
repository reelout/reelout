# ReelOut

[![NPM Version](https://img.shields.io/npm/v/reelout)](https://www.npmjs.com/package/reelout)
[![Codecov](https://img.shields.io/codecov/c/github/reelout/reelout?token=FSP5JC9E16)](https://app.codecov.io/github/reelout/reelout)

ReelOut automates releases across JavaScript and TypeScript monorepos. It
analyzes [Conventional Commits](https://conventionalcommits.org) to calculate
package version changes, update manifests and changelogs, create Git tags, and
publish packages through an extensible plugin system.

## Features

- Calculates independent release plans for workspace packages.
- Uses Conventional Commits to determine `major`, `minor`, and `patch` releases.
- Supports prerelease branches and configurable release channels.
- Extends the workflow with plugins for changelogs, npm publishing, Git tags,
  and GitHub or GitLab releases.
- Provides a dry run so you can inspect a release before publishing.

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

Preview the proposed release first:

```sh
npx reelout --dry-run
```

When the preview looks right, run the release:

```sh
npx reelout
```

With the default plugins, ReelOut analyzes commits, updates package versions and
changelogs, creates a release commit and tags, publishes eligible packages to
npm, and creates a GitHub release. See
[Getting Started](./docs/01-getting-started.md) for prerequisites and details.

## CLI

View all available options:

```sh
npx reelout --help
```

```text
Usage: reelout [options]

Plugin-driven release automation for JavaScript and TypeScript monorepos.

Options:
  --type <string>                  Choose a release type instead of deriving it from commits; use `auto` to analyze commits. (choices: "auto", "major", "minor", "patch")
  --qualifier <boolean or string>  Set the SemVer prerelease identifier (for example, `beta`); use `false` to disable it or `true` to follow branch rules.
  --channel <boolean or string>    Set the npm dist-tag (for example, `beta`); use `false` to disable it or `true` to follow branch rules.
  --allow-empty                    Run the release workflow even when no releasable changes are detected.
  --dry-run                        Preview the release without writing files, creating commits or tags, or publishing packages or releases.
  --debug                          Enable verbose logging for troubleshooting. (default: false)
  -v, --version                    Display the version number.
  -h, --help                       Display command usage and options.
```

### Prereleases

Ship prereleases with a version qualifier:

```sh
npx reelout --qualifier beta
```

Releasing from an `alpha`, `beta`, or `next` branch applies the matching
qualifier and npm channel automatically. See
[Configuration](./docs/02-config.md) to define custom branch rules.

## Documentation

- [Getting Started](./docs/01-getting-started.md) — install ReelOut, preview a release, and publish your first version.
- [Configuration](./docs/02-config.md) — configure ReelOut for your monorepo.
- [Continuous Integration](./docs/03-ci.md) — run ReelOut in GitHub Actions and CircleCI.
- [Plugins](./docs/04-plugins.md) — extend ReelOut with custom release behavior.
- [Programmatic API](./docs/05-api.md) — use ReelOut as a library.
- [Troubleshooting](./docs/06-troubleshooting.md) — diagnose and resolve common problems.

Browse the full API reference at <https://reelout.overview.vercel.app/>.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and [CHANGELOG.md](./CHANGELOG.md) for release history.

## License

This project is licensed under the [MIT License](./LICENSE).
