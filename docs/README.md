# ReelOut Documentation

ReelOut automates monorepo releases by analyzing [Conventional Commits](https://conventionalcommits.org), calculating version bumps, updating package manifests, generating changelogs, creating tags, and publishing packages to your registry.

## Guides

- [Getting Started](./01-getting-started.md) — install ReelOut, preview a release, and publish your first version.
- [Configuration](./02-config.md) — configure release rules, plugins, and other options.
- [Continuous Integration](./03-ci.md) — automate releases with GitHub Actions or CircleCI.
- [Plugins](./04-plugins.md) — learn about the release lifecycle and create custom plugins.
- [Programmatic API](./05-api.md) — use ReelOut from JavaScript or TypeScript.
- [Troubleshooting](./06-troubleshooting.md) — investigate common errors and warnings.

## API Reference

The [TypeDoc](https://typedoc.org) API reference, including these guides, is published at <https://reelout.overview.vercel.app/>. The `projectDocuments` setting in [`typedoc.json`](https://github.com/reelout/reelout/blob/main/typedoc.json) includes the Markdown files in this directory.
