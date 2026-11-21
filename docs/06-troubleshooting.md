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
| `NPM_TOKEN or ambient registry credentials are invalid or expired.`                                                                       | The `whoami` pre-flight against the publish registry failed                                                             | Refresh the token or ambient `.npmrc` credentials, then retry                                                                  |
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
| `Command '<cmd>' failed (exit code N)`                                                                                                    | An underlying `git` or `npm` command failed                                                                             | Check the error output for stderr, then retry with `--debug`                                                                   |

## Missing credentials

When a credential is missing and the run is not `--strict`, ReelOut skips the
step that needs it, logs a warning, and continues:

- No registry credentials (`NPM_TOKEN`, ambient `.npmrc` authentication, or
  OIDC): packages are not published.
- No `GITHUB_TOKEN` or `GITLAB_TOKEN`: the matching hosting releases are not
  created.

Skips never change the exit code. Pass `--strict` to fail the run instead
when a credential is missing.

Versions already published with identical content are skipped too: ReelOut
verifies the registry tarball against the local package and syncs the
release-channel dist-tag, so re-running a release is safe.

## A plugin could not be resolved

If ReelOut cannot resolve a plugin's string specifier, the release fails with a
module-not-found error. The integration plugins—`@reelout/npm`, `@reelout/git`,
`@reelout/github`, and `@reelout/gitlab`—resolve through `@reelout/config`. For
an unresolved third-party plugin, install the package or remove its entry from
[`plugins`](./02-config.md#plugins).

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

Rollbacks run while the error unwinds. Afterwards, `finalize` handlers still
run with the failure recorded on `context.outcome`, so notification plugins
report the failed outcome too.

## Warnings

These warnings are non-fatal but usually worth investigating:

- `Package could not be loaded: ...` — a workspace manifest could not be read or parsed.
- `Version could not be determined for package at ...` — a package has no readable version.
- `Tag could not be determined for package at ...` — no previous tag resolved for a package.
- `Changelog could not be generated for package at ...` — changelog generation failed for a package.
- `Packages will not be published: NPM_TOKEN is required for NPM authentication.` — npm publishing was skipped for missing registry credentials.
- `GitHub releases will not be created: GITHUB_TOKEN is not set.` — GitHub releases were skipped for a missing token.
- `GitLab releases will not be created: GITLAB_TOKEN is not set.` — GitLab releases were skipped for a missing token.
- `Skipping publish of "<name>@<version>": already published with identical content.` — the registry already holds this exact version; the dist-tag was synced instead.
