# @reelout/github

GitHub Releases integration for [ReelOut](https://github.com/reelout/reelout). The plugin creates a GitHub release for each released tag and removes releases it created if a later step fails.

## Installation

The `reelout` CLI installs this plugin through `@reelout/config`. Install it separately only when using it outside the CLI.

```sh
npm install @reelout/github
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
    '@reelout/github',
  ],
}
```

Set the `GITHUB_TOKEN` environment variable to authenticate with GitHub.

## API

- `github` (default export) — the release plugin.
- `createRelease(...)` — create a GitHub release for a tag.
- `deleteRelease(...)` — delete a release by tag.
- `isRepositoryPublic(...)` — check repository visibility via the GitHub API.

## Documentation

- [Getting Started guide](https://github.com/reelout/reelout/blob/main/docs/01-getting-started.md)
- [Continuous Integration guide](https://github.com/reelout/reelout/blob/main/docs/03-ci.md)
- [API reference](https://reelout.overview.vercel.app/)
