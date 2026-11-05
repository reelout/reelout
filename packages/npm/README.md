# @reelout/npm

npm integration for [ReelOut](https://github.com/reelout/reelout). The plugin
resolves the workspace, updates package manifests and internal dependency
ranges, and publishes packages. The package also exports manifest, workspace,
and publishing utilities for standalone use.

## Installation

The `reelout` CLI includes this plugin through `@reelout/config`. Install it
separately only when using it outside the CLI.

```sh
npm install @reelout/npm
```

This ESM-only package requires Node.js `>=24.15`.

## Usage

Add the plugin to the `plugins` array in your ReelOut configuration. Pass
options as a tuple when needed:

```ts
export default {
  plugins: [
    '@reelout/core/analyzer',
    '@reelout/core/builder',
    '@reelout/core/changelog',
    ['@reelout/npm', { access: 'public', provenance: true }],
    '@reelout/git',
    '@reelout/github',
  ],
}
```

The plugin accepts `workspace`, `access`, `provenance`, and `stage` options.

By default, the plugin checks whether the repository is public and enables
provenance for public repositories. It uses `GITHUB_TOKEN` on GitHub or
`GITLAB_TOKEN` on GitLab for this check. When `provenance` is `true`, npm also
requires a `repository` field in the published `package.json` to generate
provenance attestations.

## API

Key exports include:

- **Plugin** — `npm` (default export).
- **Publishing** — `publishPackage`, `prepareAuth`, and `resolvePublishRegistry`.
- **Manifests** — `readPackageJson`, `writePackageJson`, `updatePackageJson`, `removePackageJson`, `bumpPackageDependencies`.
- **Workspaces** — `resolveWorkspaceMembers`, `loadWorkspacePackages`, `loadPackages`, `loadRootPackage`.
- **Package managers** — `resolvePackageManager`, `inspectPackageManager`, and `getPackageManagerVersion`.
- **Registry** — `normalizeRegistry`, `getAuthTokenKey`, `resolveGitRepositoryFromPackage`.
- **Registry auth** — `hasAuth` (registry authentication detection).

## Documentation

- [Getting started](https://github.com/reelout/reelout/blob/main/docs/01-getting-started.md)
- [Configuration](https://github.com/reelout/reelout/blob/main/docs/02-config.md)
- [API reference](https://reelout.overview.vercel.app/)
