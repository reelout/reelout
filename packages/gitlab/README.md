# @reelout/gitlab

GitLab Releases integration for [ReelOut](https://github.com/reelout/reelout).
The plugin creates a GitLab release for each release tag, overwrites an
existing release for a planned tag with the freshly generated name and
description, and restores or removes what it changed if a later step fails.

## Installation

The `reelout` CLI includes this plugin through `@reelout/config`. Install it
separately only when using it outside the CLI.

```sh
npm install @reelout/gitlab
```

This ESM-only package requires Node.js `>=24.15`.

## Usage

The default configuration includes this plugin. It activates only when the
repository is hosted on GitLab — detected from the `origin` remote, falling
back to manifest URLs — and stays inactive otherwise, so a GitHub-hosted
repository runs it without side effects. Reference it explicitly in the
`plugins` array to pin or reorder it:

```ts
export default {
  plugins: [
    '@reelout/core/analyzer',
    '@reelout/core/builder',
    '@reelout/core/changelog',
    '@reelout/npm',
    '@reelout/cargo',
    '@reelout/git',
    '@reelout/github',
    '@reelout/gitlab',
  ],
}
```

Set the `GITLAB_TOKEN` environment variable to authenticate with GitLab.
The plugin verifies the token during the `configure` stage: without it, the
GitLab publishing step is skipped (or fails the release in strict mode), and
a token GitLab rejects fails the release before any release is created.

## API

- `gitlab` (default export) — the release plugin.
- `createRelease(...)` — create or overwrite a GitLab release for a tag.
- `deleteRelease(...)` — delete a release by tag.
- `isRepositoryPublic(...)` — check project visibility via the GitLab API.
- `restoreRelease(...)` — restore an overwritten release to its original content.
- `verifyToken(...)` — verify a GitLab token is accepted for the release project.

## Documentation

- [Getting started](https://github.com/reelout/reelout/blob/main/docs/01-getting-started.md)
- [Continuous integration](https://github.com/reelout/reelout/blob/main/docs/03-ci.md)
- [API reference](https://reelout.overview.vercel.app/)
