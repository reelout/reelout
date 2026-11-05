# Getting Started

Install ReelOut, preview a release, then publish when you're ready.

## Prerequisites

- **Node.js >= 24.15** — check with `node --version`.
- A **Git repository** with at least one commit, checked out on a branch.
- Commits that follow the [Conventional Commits](https://conventionalcommits.org) specification (for example `feat: ...` or `fix: ...`).
- A **GitHub** or **GitLab** remote — the default Git plugin pushes tags, and the hosting plugin creates releases.
- An **npm account and token** if you publish packages to npm.

## Installation

ReelOut is an ESM-only package:

```sh
npm install -D reelout
# or
pnpm add -D reelout
# or
yarn add -D reelout
```

The default configuration uses the integration plugins below. They are installed as dependencies of `@reelout/config` when you install the CLI:

| Package           | Purpose                                                           |
| ----------------- | ----------------------------------------------------------------- |
| `@reelout/npm`    | Resolves the workspace, updates manifests, and publishes packages |
| `@reelout/git`    | Creates the release commit and pushes tags                        |
| `@reelout/github` | Creates GitHub releases                                           |
| `@reelout/gitlab` | Creates GitLab releases                                           |

For GitLab, replace `@reelout/github` with `@reelout/gitlab` in the `plugins` list of your [configuration](./02-config.md#plugins).

## Preview a release

Simulate the release workflow without writing release files, creating the release commit or tags, or publishing packages:

```sh
npx reelout --dry-run
```

ReelOut prints a report showing each package it would release, its current and proposed versions, and the detected change type. Skipped side effects—file and changelog writes, the release commit, tag pushes, and GitHub release creation—are marked `[DRY RUN]`, and package publishing runs in npm dry-run mode.

## Ship a release

```sh
npx reelout
```

Running without `--dry-run` performs the release. With the default plugins, ReelOut:

1. **Analyze** commits since each package's last tag. Breaking changes trigger a `major` bump, `feat` triggers `minor`, and `fix`, `perf`, or `revert` triggers `patch` (see [Configuration](./02-config.md#classifier)).
2. **Build** new versions, tag names (`v<version>` for the workspace root and `<name>@<version>` for workspace packages), and release notes.
3. **Write** changelogs, update package versions and internal dependency ranges, and create a release commit.
4. **Publish** packages to npm, push tags, and create a GitHub release for each tag.

## Prereleases and channels

On a branch named `alpha`, `beta`, or `next`, ReelOut creates a prerelease (for example, `1.2.0-beta.1`) and publishes it under the matching npm dist-tag. Override these values with `--qualifier` and `--channel`, or define custom branch rules (see [Configuration](./02-config.md#rules)):

```sh
npx reelout --qualifier beta --channel beta
```

## Next steps

- [Configuration](./02-config.md) — config files, release rules, and plugin options.
- [Continuous Integration](./03-ci.md) — automate releases when changes reach `main`.
- [Plugins](./04-plugins.md) — extend the release lifecycle.
- [Troubleshooting](./06-troubleshooting.md) — when something goes wrong.
