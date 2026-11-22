# @reelout/cargo

Cargo integration for [ReelOut](https://github.com/reelout/reelout). The
plugin discovers Cargo workspaces, updates crate manifests and internal
dependency requirements, refreshes the lockfile, and publishes crates to
crates.io. The package also exports manifest, workspace, sparse-index, and
publishing utilities for standalone use.

## Installation

The `reelout` CLI includes this plugin through `@reelout/config`. Install it
separately only when using it outside the CLI.

```sh
npm install @reelout/cargo
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
    ['@reelout/cargo', { allowDirty: true }],
    '@reelout/git',
    '@reelout/github',
  ],
}
```

The plugin accepts `allowDirty` and `noVerify` options.

Crates are published with the token from the `CARGO_REGISTRY_TOKEN`
environment variable or `~/.cargo/credentials.toml`, verified against
crates.io before anything is published. On GitHub Actions without a registry
token, crates.io trusted publishing exchanges the workflow's OIDC identity
token for a short-lived publish token; outside GitHub Actions, the same flow
runs when `CARGO_ID_TOKEN` is set. Versions the registry already holds
are skipped when a local pack matches the published checksum, and a publish
that races a concurrent publication of identical content completes without
failing.

## API

Key exports include:

- **Plugin** — `cargo` (default export).
- **Publishing** — `publishCrate`, `packLocalCrate`, `probeCrateReleasePlan`, and `recoverFromCratePublishOverRejection`.
- **Manifests** — `readCargoToml`, `bumpCargoManifests`, and `loadCargoPackages`.
- **Lockfile** — `refreshCargoLock`.
- **Registry** — `resolveCargoToken`, `verifyRegistryToken`, `verifyTrustedPublishing`, `verifyPublishAccess`, and `createSparseIndexClient`.

## Documentation

- [Getting started](https://github.com/reelout/reelout/blob/main/docs/01-getting-started.md)
- [Configuration](https://github.com/reelout/reelout/blob/main/docs/02-config.md)
- [API reference](https://reelout.overview.vercel.app/)
