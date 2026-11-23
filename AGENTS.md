# ReelOut — Agent Guidelines

## Project

ReelOut is an ESM-only TypeScript monorepo managed with pnpm workspaces. The root package exposes the public API and CLI; workspace packages contain the implementation. The minimum supported Node.js version is `24.15`.

| Package                                           | Responsibility                                       |
| ------------------------------------------------- | ---------------------------------------------------- |
| `cli`                                             | Command-line interface                               |
| `config`                                          | Configuration discovery, merging, and normalization  |
| `context`                                         | Release execution context                            |
| `core`                                            | Workflow engine, hooks, and built-in release plugins |
| `cargo`, `git`, `github`, `gitlab`, `npm`, `yarn` | Git and registry-host integrations                   |

## Development

- Install workspace dependencies with `pnpm install`.
- Run a focused test with `pnpm test run <file-or-pattern>`. Use `pnpm test` for Vitest watch mode. Do not run the full suite locally — CI runs it.
- Run `pnpm lint` for lint, formatting, and repository-specific checks. Run `pnpm build` to build the workspace.
- Use `pnpm dev` to start the workspace and root build watchers.
- NEVER run `pnpm validate` locally. It installs dependencies, cleans generated output, runs linting, generates API docs, builds the workspace, and runs tests with coverage — this full pipeline belongs to CI only. Locally, use focused tests, `pnpm lint`, and `pnpm build` instead.

## Change Guidelines

- Keep package-specific code and tests in the relevant workspace package. Follow the existing TypeScript, ESM, naming, formatting, and error-handling conventions.
- Add or update tests for behavior changes, alongside the package they cover.
- Preserve public API compatibility. When changing a public API, update its documentation and affected workspace packages.
- Document exported functions with JSDoc; `pnpm lint` checks this requirement.
- Use Conventional Commit messages, such as `feat:`, `fix:`, `docs:`, and `refactor:`.
- Keep changes focused and avoid unrelated edits.

## References

- [README.md](./README.md) — product overview and CLI quick start.
- [CONTRIBUTING.md](./CONTRIBUTING.md) — development, testing, and pull request workflow.
- [docs/](./docs/) — user guides and API documentation.
