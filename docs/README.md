# ReelOut documentation

ReelOut automates monorepo releases by analyzing
[Conventional Commits](https://conventionalcommits.org), planning package
version changes, updating manifests and changelogs, creating tags, and
publishing through plugins.

## Start here

1. [Getting started](./01-getting-started.md) — install ReelOut and preview a release.
2. [Configuration](./02-config.md) — set release rules and choose plugins.
3. [Continuous integration](./03-ci.md) — automate releases in CI.
4. [Plugins](./04-plugins.md) — extend the release lifecycle.
5. [Programmatic API](./05-api.md) — run workflows from JavaScript or TypeScript.
6. [Troubleshooting](./06-troubleshooting.md) — diagnose common errors and warnings.

## API Reference

The [TypeDoc](https://typedoc.org) API reference includes these guides and is
published at <https://reelout.overview.vercel.app/>. The `projectDocuments`
setting in [`typedoc.json`](https://github.com/reelout/reelout/blob/main/typedoc.json)
includes the Markdown files in this directory.
