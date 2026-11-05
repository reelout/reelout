# Contributing

## Set up the project

ReelOut requires Node.js `>=24.15` and pnpm. Install the workspace dependencies:

```bash
pnpm install
```

Run focused checks while developing. Run the full validation pipeline before
submitting a pull request.

## Code and tests

Keep package-specific code and tests in the relevant workspace package:

```text
packages/<scope>/
├── src/
│   └── foo/
│       └── bar.ts
└── test/
    └── foo/
        └── bar.test.ts
```

- **Watch mode:** Run tests continuously:
  ```bash
  pnpm test
  ```
- **Full test suite:** Run all tests once:
  ```bash
  pnpm test run
  ```
- **Update snapshots:** Regenerate snapshots after changing a package's public
  exports in `src/index.ts`:
  ```bash
  pnpm test run --update=all "index.test.ts"
  ```

## Run the CLI locally

Choose direct TypeScript execution for quick iteration, or build first to test
the compiled CLI.

### Run from TypeScript

```bash
pnpm tsx src/cli.ts --help
pnpm tsx src/cli.ts --dry-run
```

### Run the build

```bash
pnpm build
node dist/cli.js --help
node dist/cli.js --dry-run
```

## Validate changes

Run the smallest relevant checks during development:

```bash
pnpm test run <file-or-pattern>
pnpm lint
pnpm build
```

Before submitting a pull request, run `pnpm validate`. It installs
dependencies, removes generated output, runs linting, generates the API
reference, builds the workspace, and runs the test suite with coverage.

## Documentation

User guides live in [`docs/`](./docs). TypeDoc includes the Markdown files in
that directory through the `projectDocuments` setting in [`typedoc.json`](./typedoc.json).
Add new guides there to include them in the API reference.

- **Build locally:** Generate the API reference in `generated/`, then open
  `generated/index.html` in a browser:
  ```bash
  pnpm exec typedoc --out generated
  ```
- **JSDoc:** Document every exported function with a `/** */` comment.
  `pnpm lint` checks this requirement with
  [`scripts/check-function-jsdoc.ts`](./scripts/check-function-jsdoc.ts).
- **Deployment:** Vercel builds and deploys the API reference at
  <https://reelout.overview.vercel.app/> on every push. See
  [`vercel.json`](./vercel.json) for the build settings.

## Submitting a Pull Request

### Guidelines

- **Branch naming:** Branch from `main` and use a descriptive prefix, such as
  `feature/<description>` for a new capability or `fix/<description>` for a bug
  fix.
- **Commit messages:** Follow the [Conventional Commits specification](https://www.conventionalcommits.org/) (for example, `feat(scope): add new feature` or `fix(scope): resolve issue`).

### Pull Request Checklist

Ensure your changes meet all of the following criteria before requesting a review:

- [ ] The change has a focused scope and contains no unrelated changes.
- [ ] Public API changes are documented in the PR description.
- [ ] Relevant tests pass; run the full suite with `pnpm test run`.
- [ ] `pnpm validate` succeeds.
- [ ] All CI pipeline checks pass.
