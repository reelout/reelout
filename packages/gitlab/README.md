# @reelout/gitlab

GitLab Releases integration for [ReelOut](https://github.com/reelout/reelout). The plugin creates a GitLab release for each released tag and removes releases it created if a later step fails.

## Installation

The `reelout` CLI installs this plugin through `@reelout/config`. Install it separately only when using it outside the CLI.

```sh
npm install @reelout/gitlab
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
    '@reelout/gitlab',
  ],
}
```

Set the `GITLAB_TOKEN` environment variable to authenticate with GitLab.

## API

- `gitlab` (default export) — the release plugin.
- `createRelease(...)` — create a GitLab release for a tag.
- `deleteRelease(...)` — delete a release by tag.
- `isRepositoryPublic(...)` — check project visibility via the GitLab API.

## Documentation

- [Getting Started guide](https://github.com/reelout/reelout/blob/main/docs/getting-started.md)
- [Continuous Integration guide](https://github.com/reelout/reelout/blob/main/docs/ci.md)
- [API reference](https://reelout.overview.vercel.app/)
