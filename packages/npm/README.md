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

The default configuration includes this plugin. It activates only when the
workspace root has a `package.json` and stays inactive otherwise, so
non-JavaScript repositories run it without side effects. Pass options as a
tuple when needed:

```ts
export default {
  plugins: [
    '@reelout/core/analyzer',
    '@reelout/core/builder',
    '@reelout/core/changelog',
    ['@reelout/npm', { access: 'public', provenance: true }],
    '@reelout/cargo',
    '@reelout/git',
    '@reelout/github',
    '@reelout/gitlab',
  ],
}
```

The plugin accepts `workspace`, `access`, `provenance`, and `stage` options.

By default, the plugin enables provenance only when `package.json` defines a
valid `repository` that matches the current Git remote and the repository is
public. It uses `GITHUB_TOKEN` on GitHub or `GITLAB_TOKEN` on GitLab for this
check. When `provenance` is `true`, npm also requires a `repository` field in
the published `package.json` to generate provenance attestations.

The `stage` option controls npm staged publishing: `true` stages every
package for later approval instead of publishing it immediately, `false`
publishes directly and fails when the registry requires staging, and the
default publishes directly but falls back to staging a package when the
registry rejects its direct publish with `E_STAGE_REQUIRED`. The fallback
runs per package and only for the public npm registry; when packages were
staged, the run ends with a warning that lists them alongside the package
manager's `stage list` and `stage approve <stage-id>` commands. Approving a
staged publication requires an interactive 2FA prompt, so it stays a manual
step.

Before publishing, the plugin verifies that the registry credentials grant
publish permission for each scheduled package. It checks existing packages
against their maintainers, new scoped packages against the user or
organization owning the scope, and remaining scoped packages through npm
collaborator and team permissions. A missing permission fails the release
before anything is published; inconclusive checks, such as OIDC trusted
publishing, only warn.

## API

Key exports include:

- **Plugin** — `npm` (default export).
- **Publishing** — `publishPackage`, `prepareAuth`, `resolvePublishRegistry`, and `verifyPublishAccess`.
- **Manifests** — `readPackageJson`, `writePackageJson`, `updatePackageJson`, `removePackageJson`, `bumpPackageDependencies`.
- **Workspaces** — `resolveWorkspaceMembers`, `loadWorkspacePackages`, `loadPackages`, `loadRootPackage`.
- **Package managers** — `resolvePackageManager`, `inspectPackageManager`, and `getPackageManagerVersion`.
- **Registry** — `normalizeRegistry`, `getAuthTokenKey`, `resolveGitRepositoryFromPackage`.
- **Registry auth** — `hasAuth` (registry authentication detection) and `verifyAuth` (credential verification).

## Documentation

- [Getting started](https://github.com/reelout/reelout/blob/main/docs/01-getting-started.md)
- [Configuration](https://github.com/reelout/reelout/blob/main/docs/02-config.md)
- [API reference](https://reelout.overview.vercel.app/)
