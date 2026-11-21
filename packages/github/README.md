# @reelout/github

GitHub Releases integration for [ReelOut](https://github.com/reelout/reelout).
The plugin creates a GitHub release for each release tag, overwrites an
existing release for a planned tag with the freshly generated name and notes,
and restores or removes what it changed if a later step fails.

## Installation

The `reelout` CLI includes this plugin through `@reelout/config`. Install it
separately only when using it outside the CLI.

```sh
npm install @reelout/github
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
    '@reelout/github',
  ],
}
```

Set the `GITHUB_TOKEN` environment variable to authenticate with GitHub.
The plugin verifies the token during the `configure` stage: without it, the
GitHub publishing step is skipped (or fails the release in strict mode), and
a token GitHub rejects fails the release before any release is created.

## API

- `github` (default export) — the release plugin.
- `createRelease(...)` — create or overwrite a GitHub release for a tag.
- `deleteRelease(...)` — delete a release by tag.
- `isRepositoryPublic(...)` — check repository visibility via the GitHub API.
- `verifyToken(...)` — verify a GitHub token is accepted for the release repository.

## Documentation

- [Getting started](https://github.com/reelout/reelout/blob/main/docs/01-getting-started.md)
- [Continuous integration](https://github.com/reelout/reelout/blob/main/docs/03-ci.md)
- [API reference](https://reelout.overview.vercel.app/)
