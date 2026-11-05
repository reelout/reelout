# Configuration

ReelOut uses [cosmiconfig](https://github.com/cosmiconfig/cosmiconfig) to find
configuration, merges it with the built-in defaults, and then applies CLI
overrides.

## Config file discovery

ReelOut searches upward from the current working directory and uses the first
matching file:

| Location                                                                                                                           | Format            |
| ---------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `package.json`                                                                                                                     | a `"reelout"` key |
| `.reeloutrc`                                                                                                                       | JSON or YAML      |
| `.reeloutrc.json` / `.reeloutrc.yaml` / `.reeloutrc.yml` / `.reeloutrc.js` / `.reeloutrc.ts` / `.reeloutrc.cjs` / `.reeloutrc.mjs` | JSON, YAML, or JS |
| `.config/reeloutrc` (and the same extensions as above)                                                                             | JSON, YAML, or JS |
| `reelout.config.ts` / `reelout.config.js` / `reelout.config.cjs` / `reelout.config.mjs`                                            | TypeScript or JS  |

Configuration is not read from `REELOUT_*` environment variables. Use a config
file or the CLI flags listed below.

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

- **author** — the `github-actions[bot]` identity for the release commit.
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

Breaking changes (a `!` after the type or a `BREAKING CHANGE` footer) always
bump `major`, regardless of the classifier.

### rules

Controls branch-based prereleases. When the current branch matches a rule's `pattern`, ReelOut applies its qualifier (the SemVer prerelease identifier) and channel (the npm dist-tag):

```ts
rules: [
  { type: 'branch', pattern: 'beta', qualifier: 'beta', channel: 'beta' },
  'next', // string shorthand: pattern, qualifier, and channel all become 'next'
]
```

- A string shorthand uses the label as `pattern` and its sanitized form as the
  `qualifier` and `channel`.
- `qualifier` and `channel` support `{date}` and `{time}` templates (for
  example, `alpha-{date}`).
- `false` and `null` entries are dropped.

### plugins

The ordered list of plugins to run during a release. Entries may be:

| Form                         | Example                                                    |
| ---------------------------- | ---------------------------------------------------------- |
| Module specifier             | `'@reelout/npm'`                                           |
| `[specifier, options]` tuple | `['@reelout/npm', { access: 'public', provenance: true }]` |
| Plugin factory               | `createMyPlugin({ verbose: true })`                        |
| Plugin object                | `{ name: 'my-plugin', version: '1.0.0', ... }`             |
| Disabled entry               | `false` / `null` (dropped)                                 |

ReelOut resolves string specifiers from the working directory first, then from
the context of `@reelout/config`. An unresolved specifier causes the release to
fail. See [Plugins](./04-plugins.md) for the plugin lifecycle.

## Merging behavior

ReelOut merges user configuration over the defaults. An `undefined` property
does not override its default; a supplied array replaces the default array.

## CLI overrides

| Flag                                 | Effect                                                                             |
| ------------------------------------ | ---------------------------------------------------------------------------------- |
| `--type <auto\|major\|minor\|patch>` | Choose a release type, or use `auto` to analyze commits                            |
| `--qualifier <id\|false>`            | Set the SemVer prerelease identifier, follow branch rules, or disable it           |
| `--channel <name\|false>`            | Set the npm dist-tag, follow branch rules, or disable it                           |
| `--allow-empty`                      | Run the workflow even when no releasable changes are detected                      |
| `--dry-run`                          | Preview the release without writing files or creating or publishing release assets |
| `--debug`                            | Enable verbose logging for troubleshooting                                         |
