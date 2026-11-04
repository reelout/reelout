# Contributing

## Quick Start

Install the workspace dependencies, then run the validation pipeline:

```bash
pnpm install
pnpm validate
```

## Development

Keep unit tests alongside their corresponding package source files:

```text
packages/<scope>/
├── src/
│   └── foo/
│       └── bar.ts
└── test/
    └── foo/
        └── bar.test.ts
```

- **Watch mode:** Run tests continuously during development:
  ```bash
  pnpm test
  ```
- **Single run:** Run the entire test suite once:
  ```bash
  pnpm test run
  ```
- **Update snapshots:** Regenerate snapshots after changing public exports in `src/index.ts`:
  ```bash
  pnpm test run --update=all "index.test.ts"
  ```

### Local Debugging

Run and debug the CLI locally using either direct TypeScript execution or built JavaScript artifacts.

#### Option 1: Direct Execution (TypeScript)

Execute directly from source without running a build step:

```bash
pnpm tsx src/cli.ts --help
pnpm tsx src/cli.ts --dry-run
```

#### Option 2: Built Artifacts (JavaScript)

Build the workspace and execute the compiled CLI entry point:

```bash
pnpm build
node dist/cli.js --help
node dist/cli.js --dry-run
```

### Code Validation

Run `pnpm validate` before submitting a pull request. It installs dependencies, cleans generated artifacts, runs linting, generates the API reference, builds the workspace, and runs tests with coverage.

## Documentation

User guides live in [`docs/`](./docs). TypeDoc includes every `docs/*.md` file in the API reference through the `projectDocuments` setting in [`typedoc.json`](./typedoc.json). Add new guides there to include them in the next documentation build.

- **Build locally:** Generate the API reference in `generated/`, then open `generated/index.html` in a browser:
  ```bash
  pnpm exec typedoc --out generated
  ```
- **JSDoc:** Document every exported function with a `/** */` comment. `pnpm lint` checks this requirement with [`scripts/check-function-jsdoc.ts`](./scripts/check-function-jsdoc.ts).
- **Deployment:** Vercel builds and deploys the API reference at <https://reelout.overview.vercel.app/> on every push. See [`vercel.json`](./vercel.json) for the build settings.

## Submitting a Pull Request

### Guidelines

- **Branch naming:** Branch from `main` and use a descriptive prefix, such as `feature/<description>` for a new capability or `fix/<description>` for a bug fix.
- **Commit messages:** Follow the [Conventional Commits specification](https://www.conventionalcommits.org/) (for example, `feat(scope): add new feature` or `fix(scope): resolve issue`).

### Pull Request Checklist

Ensure your changes meet all of the following criteria before requesting a review:

- [ ] The change has a focused scope and contains no unrelated changes.
- [ ] Public API changes are documented in the PR description.
- [ ] All unit tests pass (`pnpm test run`).
- [ ] Build, linting, and formatting checks succeed (`pnpm validate`).
- [ ] All CI pipeline checks pass.
