# Troubleshooting

## Enable debug logging

Pass `--debug` for verbose output. In GitHub Actions, ReelOut enables debug logging automatically when `RUNNER_DEBUG` or `ACTIONS_STEP_DEBUG` is truthy.

## Common errors

| Message                                                                             | Cause                                                      | Fix                                                                       |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------- |
| `A Git remote must be configured to push tags.`                                     | No `origin` remote is configured                           | `git remote add origin <url>`                                             |
| `The GITHUB_TOKEN environment variable is required.`                                | The GitHub plugin needs a token                            | Set `GITHUB_TOKEN` (in GitHub Actions, use `${{ secrets.GITHUB_TOKEN }}`) |
| `The GITLAB_TOKEN environment variable is required.`                                | The GitLab plugin needs a token                            | Set `GITLAB_TOKEN`                                                        |
| `Initialize a Git repository with at least one commit before running this command.` | ReelOut runs in a fresh or empty directory                 | Initialize the repository and make at least one commit                    |
| `Check out a Git branch in your repository before proceeding.`                      | HEAD is detached or the repo has no branch                 | Check out a branch                                                        |
| `Package name is required to build a tag name.`                                     | A non-root workspace package has no `name` in its manifest | Add a `name` to that `package.json`                                       |
| `Package version "<v>" in "<dir>" is not a valid semantic version.`                 | A manifest contains a non-SemVer version                   | Fix the `version` field                                                   |
| `The current version "<v>" is not a valid semantic version.`                        | The previous stable version could not be parsed            | Fix the `version` field                                                   |
| `The resolved version qualifier "<q>" is not a valid SemVer prerelease identifier.` | The qualifier is not a valid prerelease identifier         | Use identifiers such as `alpha`, `beta.1`, `rc.2`                         |
| `Version "<v>" must be strictly lower than preceding version "<p>".`                | A package version would move backwards                     | Correct the affected version                                              |
| `Command '<cmd>' failed (exit code N)`                                              | An underlying `git` or `npm` command failed                | Check the error output for stderr, then retry with `--debug`              |

## A plugin could not be resolved

If ReelOut cannot resolve a plugin's string specifier, the release fails with a module-not-found error. The integration plugins—`@reelout/npm`, `@reelout/git`, `@reelout/github`, and `@reelout/gitlab`—resolve through `@reelout/config`. For an unresolved third-party plugin, install the package or remove its entry from [`plugins`](./02-config.md#plugins).

## No packages are scheduled for release

ReelOut reports "No packages are scheduled for release." when no commits since the last tags match the [classifier](./02-config.md#classifier). You can:

- Land a qualifying commit (`feat:`, `fix:`, ...).
- Proceed via prerelease or 0.x promotion with `--allow-empty`; stable packages without changes are still skipped.

## Shallow clones in CI

ReelOut detects shallow repositories and fetches the missing history and tags automatically. If your CI network restricts `git fetch`, configure a full checkout instead (for example, `fetch-depth: 0` with `actions/checkout`).

## Dry runs

`--dry-run` simulates the workflow and logs a `[DRY RUN] ...` line for each skipped side effect, including file and changelog writes, the release commit, tag pushes, and GitHub release creation.

## Failure rollback

On failure, the Git plugin removes local tags it created and remote tags it pushed. The GitHub and GitLab plugins also remove releases created earlier in the run.

## Warnings

These warnings are non-fatal but usually worth investigating:

- `Package could not be loaded: ...` — a workspace manifest could not be read or parsed.
- `Version could not be determined for package at ...` — a package has no readable version.
- `Tag could not be determined for package at ...` — no previous tag resolved for a package.
- `Changelog could not be generated for package at ...` — changelog generation failed for a package.
