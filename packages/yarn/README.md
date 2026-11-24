# @reelout/yarn

Yarn integration for [ReelOut](https://github.com/reelout/reelout). The plugin
resolves Yarn workspaces (Classic and Berry), updates package manifests and
internal dependency ranges, and publishes packages with the active Yarn
version.

## Installation

This plugin is **opt-in**: the `reelout` CLI does not include it through
`@reelout/config`. Install it and register it in your configuration to publish
Yarn workspaces.

```sh
npm install @reelout/yarn
```

This ESM-only package requires Node.js `>=24.15`.

## Usage

Add the plugin to the `plugins` array of your configuration:

```ts
export default {
  plugins: [
    '@reelout/core/analyzer',
    '@reelout/core/builder',
    '@reelout/core/changelog',
    '@reelout/npm',
    '@reelout/yarn',
    '@reelout/cargo',
    '@reelout/git',
    '@reelout/github',
    '@reelout/gitlab',
  ],
}
```

The plugin activates only when Yarn (Classic or Berry) is the active package
manager of the workspace and stays inactive otherwise, so non-Yarn repositories
run it without side effects. When it activates, the npm plugin stays inactive
instead, so packages publish through Yarn. The plugin accepts `workspace`,
`access`, `provenance`, and `stage` options.

Yarn releases authenticate with registry credentials only: an `NPM_TOKEN`
environment variable, ambient `.npmrc` authentication (Yarn Classic), or
`.yarnrc.yml` credentials (Yarn Berry). The registry offers no OIDC exchange
for Yarn, so OIDC identity tokens are not used.

The `stage` option controls staged publishing: `true` stages every package
for later approval instead of publishing it immediately, `false` publishes
directly and fails when the registry requires staging, and the default
publishes directly but falls back to staging a package when the registry
rejects its direct publish with `E_STAGE_REQUIRED`. The fallback runs per
package and only for the public npm registries; when packages were staged, the
run ends with a warning that lists them alongside the `yarn npm stage list`
and `yarn npm stage approve <stage-id>` commands. Approving a staged
publication requires an interactive 2FA prompt, so it stays a manual step.
Yarn Classic cannot stage and fails when staging is requested.

By default, the plugin enables provenance only when `package.json` defines a
valid `repository` that matches the current Git remote and the repository is
public. Provenance attestations require Yarn Berry; Yarn Classic publishes
without them.

Before publishing, the plugin verifies that the registry credentials grant
publish permission for each scheduled package. It checks existing packages
against their maintainers, new scoped packages against the user or
organization owning the scope, and remaining scoped packages through npm
collaborator and team permissions. A missing permission fails the release
before anything is published; inconclusive checks only warn.

## API

The package exposes a thin surface: the `yarn` plugin (default export)
configured through `PluginOptions`, plus the `PLUGIN_NAME` constant
(`@reelout/yarn`). Workspace resolution, probing, and publishing utilities
live in [`@reelout/npm`](https://www.npmjs.com/package/@reelout/npm), which
this plugin shares with the npm plugin.

## Documentation

- [Getting started](https://github.com/reelout/reelout/blob/main/docs/01-getting-started.md)
- [Configuration](https://github.com/reelout/reelout/blob/main/docs/02-config.md)
- [API reference](https://reelout.overview.vercel.app/)
