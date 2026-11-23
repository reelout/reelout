# Troubleshooting

## Enable debug logging

Pass `--debug` for verbose output. In GitHub Actions, ReelOut enables debug
logging automatically when `RUNNER_DEBUG` or `ACTIONS_STEP_DEBUG` is truthy.

## Common errors

| Message                                                                                                                                   | Cause                                                                                                                   | Fix                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `A Git remote must be configured to push tags.`                                                                                           | No `origin` remote is configured                                                                                        | `git remote add origin <url>`                                                                                                  |
| `The GITHUB_TOKEN environment variable is required in strict mode.`                                                                       | The GitHub plugin needs a token in strict mode                                                                          | Set `GITHUB_TOKEN` (GitHub Actions provides `${{ secrets.GITHUB_TOKEN }}`), or drop `--strict` to skip GitHub releases instead |
| `The GITLAB_TOKEN environment variable is required in strict mode.`                                                                       | The GitLab plugin needs a token in strict mode                                                                          | Set `GITLAB_TOKEN`, or drop `--strict` to skip GitLab releases instead                                                         |
| `NPM_TOKEN is required for NPM authentication in strict mode.`                                                                            | npm publishing needs registry credentials in strict mode                                                                | Set `NPM_TOKEN`, or drop `--strict` to skip npm publishing instead                                                             |
| `NPM_TOKEN is required for Yarn authentication in strict mode.`                                                                           | Yarn publishing needs registry credentials in strict mode                                                               | Set `NPM_TOKEN`, or drop `--strict` to skip Yarn publishing instead                                                            |
| `NPM_TOKEN or ambient registry credentials are invalid or expired.`                                                                       | The `whoami` or publish access pre-flight against the publish registry failed                                           | Refresh the token or ambient `.npmrc` credentials, then retry                                                                  |
| `Missing publish permission for "<name>@<version>" (<registry>).`                                                                         | The publish access pre-flight found no publish permission for the listed packages                                       | Grant the publishing identity maintainer or write access, or fix the credentials, then retry                                   |
| `Trusted publishing could not be verified for "<name>@<version>" (<reason>).`                                                             | The npm registry rejected the trusted-publishing token exchange for the listed packages, or the exchange request failed | Configure the package for trusted publishing on npmjs.com, check the network, or publish with `NPM_TOKEN` instead              |
| `OIDC identity token is not available.`                                                                                                   | No usable OIDC identity token is configured                                                                             | Set a valid `NPM_ID_TOKEN` or `CARGO_ID_TOKEN`, or grant the workflow `id-token: write` and retry                              |
| `OIDC identity token could not be retrieved from GitHub Actions: <reason>`                                                                | The request for the CI platform's OIDC identity token failed                                                            | Grant the workflow `id-token: write` and retry                                                                                 |
| `The CARGO_REGISTRY_TOKEN environment variable is required in strict mode.`                                                               | The Cargo plugin needs a registry token in strict mode                                                                  | Set `CARGO_REGISTRY_TOKEN`, or drop `--strict` to skip crate publishing instead                                                |
| `CARGO_REGISTRY_TOKEN or stored registry credentials could not be verified.`                                                              | The crates.io token pre-flight check failed                                                                             | Refresh `CARGO_REGISTRY_TOKEN` or the stored registry credentials, then retry                                                  |
| `The cargo command is required for Cargo releases in strict mode.`                                                                        | The `cargo` executable was not found in strict mode                                                                     | Install Rust, or drop `--strict` to skip crate publishing instead                                                              |
| `Crates will not be published: the authenticated registry user is not an owner of "<targets>".`                                           | The verified crates.io account does not own the crates                                                                  | Ask an existing owner to add your account on crates.io, then retry                                                             |
| `Cargo.lock could not be refreshed: 'cargo update --workspace' failed.`                                                                   | The lockfile refresh after manifest updates failed                                                                      | Check the `cargo update` output, fix the workspace, then retry                                                                 |
| `…files in the working directory contain changes that were not yet committed into git…`                                                   | cargo refuses to package a crate with uncommitted changes                                                               | Commit or stash the changes, or enable the plugin's `allowDirty` option; dry runs pass `--allow-dirty` automatically           |
| `Crates "a" and "b" inherit the workspace version but were planned at different versions ("1.2.3" and "1.3.0").`                          | Crates sharing the [workspace.package] version were planned to different versions                                       | Align the plans, for example with `--type`, or release the crates separately                                                   |
| `Trusted publishing could not be verified: <reason>`                                                                                      | The crates.io trusted-publishing token exchange failed                                                                  | Configure the crates for trusted publishing on crates.io, check the network, or publish with `CARGO_REGISTRY_TOKEN` instead    |
| `The GITHUB_TOKEN environment variable could not be verified.`                                                                            | The GitHub token pre-flight check could not read the release repository                                                 | Refresh `GITHUB_TOKEN` or grant it access to the repository, then retry                                                        |
| `The GITLAB_TOKEN environment variable could not be verified.`                                                                            | The GitLab token pre-flight check could not read the release project                                                    | Refresh `GITLAB_TOKEN` or grant it access to the project, then retry                                                           |
| `Version "<name>@<version>" was not published: the registry already has this version and its content could not be verified as identical.` | The registry already holds this version, but its content is not identical to the local package or could not be verified | Revert to the published content, or publish a new version; check `--debug` output for verification failures                    |
| `Initialize a Git repository with at least one commit before running this command.`                                                       | ReelOut runs in a fresh or empty directory                                                                              | Initialize the repository and make at least one commit                                                                         |
| `Check out a Git branch in your repository before proceeding.`                                                                            | HEAD is detached or the repo has no branch                                                                              | Check out a branch                                                                                                             |
| `Package name is required to build a tag name.`                                                                                           | A non-root workspace package has no `name` in its manifest                                                              | Add a `name` to that `package.json`                                                                                            |
| `Package version "<v>" in "<dir>" is not a valid semantic version.`                                                                       | A manifest contains a non-SemVer version                                                                                | Fix the `version` field                                                                                                        |
| `The current version "<v>" is not a valid semantic version.`                                                                              | The previous stable version could not be parsed                                                                         | Fix the `version` field                                                                                                        |
| `The resolved version qualifier "<q>" is not a valid SemVer prerelease identifier.`                                                       | The qualifier is not a valid prerelease identifier                                                                      | Use identifiers such as `alpha`, `beta.1`, `rc.2`                                                                              |
| `Version "<v>" must be strictly lower than preceding version "<p>".`                                                                      | A package version would move backwards                                                                                  | Correct the affected version                                                                                                   |
| `Command '<cmd>' failed (exit code N)`                                                                                                    | An underlying `git`, `npm`, or `cargo` command failed                                                                   | Check the error output for stderr, then retry with `--debug`                                                                   |
| `Staged publishing is not supported by Yarn Classic.`                                                                                     | Staged publishing was requested while the active package manager is Yarn 1.x, which has no staging support              | Switch to Yarn Berry, npm, or pnpm to stage the package                                                                        |

## Missing credentials

When a credential is missing and the run is not `--strict`, ReelOut skips the
step that needs it, logs a warning, and continues:

- No registry credentials (`NPM_TOKEN`, ambient `.npmrc` authentication, or
  OIDC): packages are not published.
- No Yarn registry credentials (`NPM_TOKEN`, ambient `.npmrc` authentication
  for Yarn Classic, or `.yarnrc.yml` for Yarn Berry): Yarn packages are not
  published.
- No `CARGO_REGISTRY_TOKEN`, ambient `~/.cargo/credentials.toml` (honoring
  `CARGO_HOME`), or trusted publishing: crates are not published.
- No `GITHUB_TOKEN` or `GITLAB_TOKEN`: the matching hosting releases are not
  created.

Skips never change the exit code. Pass `--strict` to fail the run instead
when a credential is missing.

Versions already published with identical content are skipped too, so
re-running a release is safe: for npm packages ReelOut verifies the registry
tarball against the local package and syncs the release-channel dist-tag; for
crates it compares the sparse-index checksum against a locally packed crate.

## Publish permission pre-flight

Before publishing, the npm and Yarn plugins check that the registry
credentials can publish each scheduled package: maintainers for existing
packages, scope ownership or organization membership for new scoped packages,
and npm collaborator and team permissions otherwise. When the registry shows no
publish access, the release fails with `Missing publish permission ...`
before anything is published.

The check is best-effort and cannot cover every registry behavior:

- OIDC trusted publishing (`NPM_ID_TOKEN`) cannot be probed with registry
  lookups. ReelOut verifies it beforehand through the registry's
  trusted-publishing token exchange for npm and pnpm releases to the public
  npm registry, failing before anything is published when the exchange is
  rejected; the publish permission warning still fires for those releases
  because the registry's access endpoints do not accept OIDC tokens. Yarn
  releases are not verified and rely on the registry's own rejection, which
  can surface mid-run after earlier packages were already published.
- Two-factor authentication is enforced by the registry at publish time, not
  by this check.
- Registries without npm's access endpoints, such as GitHub Packages or
  Verdaccio, cannot be verified beyond maintainer metadata, so those checks
  stay inconclusive and only warn.
- Yarn Berry keeps ambient registry credentials in `.yarnrc.yml`, which the
  npm CLI cannot read, so its collaborator, team, and organization lookups
  stay inconclusive and only warn; an injected `NPM_TOKEN` is still verified,
  unless ambient credentials take precedence over the token, in which case
  those lookups stay inconclusive too.
- Organization membership does not always imply publish rights; the registry
  remains the final authority and rejects unauthorized publishes.
- Some registries report a restricted package like a missing one (404), so a
  restricted existing package can pass the pre-flight as new and `allowed`;
  the registry still rejects the publish.

## Staged publishing

npm's staged publishing holds a publication server-side until it is approved:
`npm stage publish` (or `pnpm stage publish`, or `yarn npm publish --staged`)
stages the package, `<package manager> stage list` reviews it, and
`stage approve <stage-id>` finishes the release with an interactive 2FA
prompt. Yarn Classic has no staging support and fails when staging is
requested.

The `stage` option of the npm and Yarn plugins selects the behavior:

- **unset (default)**: packages publish directly. When the registry rejects
  a direct publish with `E_STAGE_REQUIRED` — credentials that may only
  stage, or a package configured to require staging — the plugin falls back
  to staged publishing for that package and continues. The fallback applies
  per package and only to the public npm registry; it fails the release when
  the staged publish fails too.
- **`true`**: every package is staged from the start; nothing goes live
  until each staged publication is approved.
- **`false`**: packages publish directly and the release fails when the
  registry requires staging; no fallback is attempted.

When the fallback staged packages, the run ends with a warning that lists
them alongside the package manager's `stage list` and
`stage approve <stage-id>` commands.

Limitations:

- `--dry-run` cannot preview the fallback: dry runs never reach the
  registry's permission checks, so a dry run reports a successful direct
  publish even when the real run would stage the package.
- Re-running a release over an already staged version fails loudly: staged
  versions share the published index, so the registry rejects the duplicate.
  Approve the staged publication, or reject it with `stage reject
<stage-id>`, then re-run.

## Cargo publishing caveats

The Cargo plugin verifies crates.io publish access before publishing, but
crates.io offers no official API for it, so the check relies on heuristics
with accepted limitations:

- Crates owned by a team cannot be resolved to the authenticated user; access
  is treated as unknown and the publish attempt decides.
- Publishes through trusted publishing skip the ownership check: the
  exchanged token carries no user identity, so the publish attempt decides.
- A crate missing from the sparse index is treated as new and allowed, so a
  reserved name or a policy rejection can pass the pre-flight and surface only
  at publish time.
- The unofficial `/api/v1/me` and `/api/v1/crates/<name>/owners` endpoints may
  change; ownership parse failures degrade to unknown access, while account
  parse failures fail the registry token verification.
- The identical-content check compares the registry checksum against a locally
  packed crate. Non-reproducible packaging, such as differing `include` or
  `exclude` rules, causes a mismatch that fails the release; confirm the
  difference manually and publish a new version instead.

crates.io has no staged publishing: no `cargo` command or registry protocol
stages a crate, publishes are permanent, and `yank` only hides a version from
the index. The Cargo plugin therefore publishes directly with no staging
equivalent.

## Cargo manifest bumping

Manifest edits are targeted text edits that preserve comments and
formatting, with two limits:

- A renamed dependency, one that targets a released crate through
  `package = "…"`, keeps its current requirement.
- Only a single leading `^`, `~`, or `=` is preserved, so compound
  requirements such as `^1.0, <2.0` are rewritten to the leading comparator
  alone.

## Plugin activation

Every built-in plugin is enabled by default and activates only when the
repository matches: npm for a root `package.json` whose active package manager
is npm or pnpm, Cargo for a root `Cargo.toml`, and GitHub or GitLab for a
matching Git remote. The Yarn plugin is opt-in and never enables itself:
install `@reelout/yarn` and list it in [`plugins`](./02-config.md#plugins) to
publish Yarn workspaces. Inactive plugins are skipped entirely — they verify no
tokens and make no requests — and `--strict` does not escalate inactivity.

Run with `--debug` to see why a plugin is inactive:

- `NPM workspace could not be found at "<path>".`
- `NPM plugin is inactive: Yarn is the active package manager.`
- `Cargo workspace could not be found at "<path>".`
- `GitHub releases will not be created: no GitHub-hosted repository was detected.`
- `GitLab releases will not be created: no GitLab-hosted repository was detected.`

Mixed repositories activate more than one integration: a JavaScript workspace
that also keeps a `Cargo.toml` publishes crates in addition to packages, so a
missing `CARGO_REGISTRY_TOKEN` warns — or fails under `--strict` — even when
the crates are incidental. Override [`plugins`](./02-config.md#plugins) to
remove the unwanted integration.

## A plugin could not be resolved

If ReelOut cannot resolve a plugin's string specifier, the release fails with a
module-not-found error. The integration plugins—`@reelout/npm`,
`@reelout/cargo`, `@reelout/git`, `@reelout/github`, and
`@reelout/gitlab`—resolve through `@reelout/config`. The opt-in
`@reelout/yarn` plugin must be installed separately before it can be
registered. For an unresolved third-party plugin, install the package or
remove its entry from [`plugins`](./02-config.md#plugins).

## No packages are scheduled for release

ReelOut reports "No packages are scheduled for release." when no commits since
the last tags match the [classifier](./02-config.md#classifier). You can:

- Land a qualifying commit (`feat:`, `fix:`, ...).
- Proceed with a prerelease or 0.x promotion using `--allow-empty`. Stable
  packages without changes are still skipped unless `--type patch` is set.
  With `--type patch`, every package receives an update: stable packages are
  bumped by a patch version (`1.2.3` → `1.2.4`, or `1.2.4-dev.0` with
  `--qualifier dev`) and prerelease cycles (pre-major, pre-minor, and
  pre-patch) continue with an incremented counter (`1.2.3-dev.1` →
  `1.2.3-dev.2`), redirect to a differing qualifier (`1.2.3-rc.1` →
  `1.2.3-dev.0`), or release their stable base when no `--qualifier` is set
  (`1.2.3-dev.1` → `1.2.3`).

## Shallow clones in CI

ReelOut detects shallow repositories and fetches missing history and tags
automatically. If your CI network restricts `git fetch`, configure a full
checkout instead (for example, `fetch-depth: 0` with `actions/checkout`).

## Dry runs

`--dry-run` simulates the workflow. Built-in plugins log `[DRY RUN]` for
skipped side effects, including file and changelog writes, the release commit,
tag pushes, and GitHub release creation. Steps skipped for missing
credentials log a warning. The release report marks dry runs on the status
line, in both the console output and the GitHub Actions job summary.

## Failure rollback

On failure, the Git plugin removes local tags it created and remote tags it
pushed. The GitHub and GitLab plugins also restore the name and notes of
releases they overwrote and remove releases they created earlier in the run.

Rollbacks run while the error unwinds. Afterwards, `finalize` middleware still
run with the failure recorded on `context.outcome`, so notification plugins
report the failed outcome too.

## Warnings

These warnings are non-fatal but usually worth investigating:

- `Package could not be loaded: ...` — a workspace manifest could not be read or parsed.
- `Version could not be determined for package at ...` — a package has no readable version.
- `Tag could not be determined for package at ...` — no previous tag resolved for a package.
- `Changelog could not be generated for package at ...` — changelog generation failed for a package.
- `Packages will not be published: NPM_TOKEN is required for NPM authentication.` — npm publishing was skipped for missing registry credentials.
- `Packages will not be published: NPM_TOKEN is required for Yarn authentication.` — Yarn publishing was skipped for missing registry credentials.
- `Crates will not be published: a crates.io registry token is required.` — crate publishing was skipped for missing registry credentials.
- `Crates will not be published: the cargo command is not available.` — crate publishing was skipped because `cargo` is not installed.
- `Cargo.lock will not be refreshed: the cargo command is not available.` — the lockfile refresh was skipped because `cargo` is not installed.
- `Publish access could not be verified for "<name>@<version>": publishing will proceed and fail if access is missing.` — crates.io ownership could not be determined for the crate; the publish attempt decides.
- `GitHub releases will not be created: GITHUB_TOKEN is not set.` — GitHub releases were skipped for a missing token.
- `GitLab releases will not be created: GITLAB_TOKEN is not set.` — GitLab releases were skipped for a missing token.
- `Skipping publish of "<name>@<version>": already published with identical content.` — the registry already holds this exact version; npm also syncs the release-channel dist-tag.
- `Could not verify publish permission for "<name>@<version>": the registry will reject the publish if access is missing.` — publish permission could not be determined; the publish itself still runs.
- `Falling back to staged publish of "<name>@<version>": the registry requires staged publishing.` — the registry rejected the direct publish with `E_STAGE_REQUIRED`, so the package was staged for approval instead.
- `Staged publish fallback for "<name>@<version>" is disabled by the "stage" option, but the registry requires staged publishing. Set "stage" to true or remove the option to enable staged publishing.` — a stage-required rejection surfaced while the fallback was disabled; the release failed with the original error. The warning is emitted only when enabling the fallback would deliver staged publishing (npm, pnpm, or Yarn Berry on the public npm registry).
- `Packages were staged instead of published: <targets>. Review the staged publications with "<stageCommand> list" and finish the release with "<stageCommand> approve <stage-id>".` — the run finished, but the listed packages wait for approval.
