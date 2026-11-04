# Configuration

ReelOut loads a configuration file through [cosmiconfig](https://github.com/cosmiconfig/cosmiconfig), merges it with the built-in defaults, and then applies any CLI flag overrides.

## Config file discovery

ReelOut searches upward from the current working directory and uses the first matching file:

| Location                                                                                                         | Format            |
| ---------------------------------------------------------------------------------------------------------------- | ----------------- |
| `package.json`                                                                                                   | a `"reelout"` key |
| `.reeloutrc`                                                                                                     | JSON or YAML      |
| `.reeloutrc.json` / `.reeloutrc.yaml` / `.reeloutrc.yml` / `.reeloutrc.js` / `.reeloutrc.cjs` / `.reeloutrc.mjs` | JSON, YAML, or JS |
| `.config/reeloutrc` (and the same extensions as above)                                                           | JSON, YAML, or JS |
| `reelout.config.ts` / `reelout.config.js` / `reelout.config.cjs` / `reelout.config.mjs`                          | TypeScript or JS  |

ReelOut does not support `REELOUT_*` environment variables for configuration. Use a config file or the CLI flags listed below.

## Example

```ts
// reelout.config.ts
import type { ReleaseConfig } from 'reelout'

export default {
  author: {
    name: 'Release Bot',
    email: 'release@example.com',
  },
  classifier: {
    major: [],
    minor: ['feat'],
    patch: ['fix', 'perf', 'revert'],
  },
  rules: ['alpha', 'beta', 'next'],
  plugins: [
    '@reelout/core/analyzer',
    '@reelout/core/builder',
    '@reelout/core/changelog',
    '@reelout/npm',
    '@reelout/git',
    '@reelout/github',
  ],
} satisfies ReleaseConfig
```

## Defaults

By default, ReelOut is configured for an npm monorepo hosted on GitHub:

- **author** — the `github-actions[bot]` identity, used for the release commit.
- **classifier** — breaking changes bump `major`; `feat` bumps `minor`; `fix`, `perf`, and `revert` bump `patch`.
- **rules** — the `alpha`, `beta`, and `next` branches release with a matching qualifier and channel.
- **plugins** — `@reelout/core/analyzer`, `@reelout/core/builder`, `@reelout/core/changelog`, `@reelout/npm`, `@reelout/git`, and `@reelout/github`.

## Options

All options are optional; any you leave `undefined` fall back to the defaults.

### author

The Git author for the release commit, specified as `{ name, email }`. If either field is missing, ReelOut uses the default author.

### classifier

Maps Conventional Commit types to release types:

```ts
classifier: {
  major: [],                        // commit types that bump major
  minor: ['feat'],                  // commit types that bump minor
  patch: ['fix', 'perf', 'revert'], // commit types that bump patch
}
```

Commits marked as breaking changes (a `!` in the type or a `BREAKING CHANGE` footer) always bump `major`, regardless of the classifier.

### rules

Controls branch-based prereleases. When the current branch matches a rule's `pattern`, ReelOut applies its qualifier (the SemVer prerelease identifier) and channel (the npm dist-tag):

```ts
rules: [
  { type: 'branch', pattern: 'beta', qualifier: 'beta', channel: 'beta' },
  'next', // string shorthand: pattern, qualifier, and channel all become 'next'
]
```

- A string shorthand sets `pattern`, `qualifier`, and `channel` to the same sanitized label.
- `qualifier` and `channel` support `{{date}}` and `{{time}}` templates (for example, `alpha-{{date}}`).
- `false` and `null` entries are ignored, allowing you to disable rules inherited from the defaults.

### plugins

The ordered list of plugins to run during a release. Entries may be:

| Form                         | Example                                                    |
| ---------------------------- | ---------------------------------------------------------- |
| Module specifier             | `'@reelout/npm'`                                           |
| `[specifier, options]` tuple | `['@reelout/npm', { access: 'public', provenance: true }]` |
| Plugin factory               | `createMyPlugin({ verbose: true })`                        |
| Plugin object                | `{ name: 'my-plugin', version: '1.0.0', ... }`             |
| Disabled entry               | `false` / `null` (dropped)                                 |

ReelOut resolves string specifiers from the working directory first, then from the context of `@reelout/config`. An unresolved specifier causes the release to fail. See [Plugins](./plugins.md) for the plugin lifecycle.

## Merging behavior

ReelOut merges user configuration over the defaults. An `undefined` property does not override its default, while a supplied array replaces the default array.

## CLI overrides

| Flag                                 | Effect                                                    |
| ------------------------------------ | --------------------------------------------------------- |
| `--type <auto\|major\|minor\|patch>` | Use a fixed release type instead of analyzing commits     |
| `--qualifier <id\|false>`            | Override the version qualifier or disable it with `false` |
| `--channel <name\|false>`            | Override the npm dist-tag or disable it with `false`      |
| `--allow-empty`                      | Continue when no qualifying changes are detected          |
| `--dry-run`                          | Simulate the workflow without making changes              |
| `--debug`                            | Enable verbose logging                                    |
