# Configuration

ReelOut discovers configuration with
[cosmiconfig](https://github.com/cosmiconfig), combines it with built-in
defaults, then applies command-line options. Configuration values are not read
from `REELOUT_*` environment variables.

## Find a configuration file

ReelOut searches upward from the current working directory and uses the first
configuration it finds. Supported locations are:

- `package.json`, under the `"reelout"` key
- `.reeloutrc` or `.config/reeloutrc` (JSON or YAML)
- `.reeloutrc.{json,yaml,yml,js,ts,cjs,mjs}` or
  `.config/reeloutrc.{json,yaml,yml,js,ts,cjs,mjs}`
- `reelout.config.{js,ts,cjs,mjs}`

JavaScript and TypeScript config files should export the configuration as their
default export. For example:

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

## Configuration options

All options are optional. If omitted, ReelOut uses the defaults described
below.

### `author`

The Git author for the release commit:

```ts
author: {
  name: 'Release Bot',
  email: 'release@example.com',
}
```

Provide both `name` and `email`. If either is missing, ReelOut uses the default
GitHub Actions bot identity.

### `classifier`

Maps Conventional Commit types to release types. The default mapping is:

```ts
classifier: {
  major: [],
  minor: ['feat'],
  patch: ['fix', 'perf', 'revert'],
}
```

You can change the mapping or provide a classifier function. Breaking changes
always trigger a `major` release, regardless of the classifier: ReelOut detects
them from a `!` after the commit type or a `BREAKING CHANGE` footer.

### `rules`

Rules match the current branch and set the prerelease qualifier and npm channel.
ReelOut checks them in order and uses the first match. A rule's `pattern` is a
glob; `type` is optional and defaults to `branch`.

```ts
rules: [
  { type: 'branch', pattern: 'beta', qualifier: 'beta', channel: 'beta' },
  'next',
]
```

A string is shorthand for a rule whose pattern, qualifier, and channel use that
string; its qualifier and channel are sanitized for use as a SemVer prerelease
identifier and npm dist-tag. Use an object to define a glob pattern or when the
qualifier or channel should differ from the pattern:

```ts
rules: [{ pattern: 'release/*', qualifier: 'rc', channel: 'candidate' }]
```

For object rules, qualifier and channel values are used as provided rather than
sanitized.

Qualifier and channel strings support `{date}` and `{time}` templates, for
example, `alpha-{date}`. Rules without a `pattern`, as well as `false`, `null`,
and `undefined` entries, are ignored.

By default, the `alpha`, `beta`, and `next` branches each use the same label for
their prerelease qualifier and npm channel.

### `plugins`

An ordered list of plugins to run during the release. By default, ReelOut runs
the analyzer, builder, and changelog plugins, followed by npm publishing, Git
operations, and GitHub releases.

Entries can be module specifiers, plugin factories or objects, or tuples that
pass options to a plugin factory:

```ts
plugins: [
  '@reelout/core/analyzer',
  ['@reelout/npm', { access: 'public', provenance: true }],
  createMyPlugin({ verbose: true }),
  { name: 'my-plugin', version: '1.0.0', finalize: myHandler },
]
```

Set an entry to `false` or `null` to omit it. ReelOut resolves string
specifiers from the working directory first, then from the context of
`@reelout/config`. An unresolved plugin causes configuration loading to fail.
See the [Plugins guide](./04-plugins.md) for plugin authoring and registration
details.

## Defaults and merging

ReelOut's default configuration targets an npm monorepo hosted on GitHub:

| Option       | Default                                                                             |
| ------------ | ----------------------------------------------------------------------------------- |
| `author`     | The `github-actions[bot]` identity                                                  |
| `classifier` | Breaking changes → `major`; `feat` → `minor`; `fix`, `perf`, and `revert` → `patch` |
| `rules`      | `alpha`, `beta`, and `next` branches use matching qualifiers and channels           |
| `plugins`    | Analyzer, builder, changelog, npm, Git, and GitHub plugins, in that order           |

ReelOut merges user configuration over these defaults at the top level.
Unspecified values retain their defaults; a supplied array replaces the
default array rather than appending to it. For example, setting `plugins`
replaces the full default plugin list, so include any built-ins you still need.

## Command-line overrides

CLI options override the corresponding release settings for a run:

| Flag                                 | Effect                                                                                       |
| ------------------------------------ | -------------------------------------------------------------------------------------------- |
| `--type <auto\|major\|minor\|patch>` | Choose a release type; `auto` derives it from commits                                        |
| `--qualifier <id\|true\|false>`      | Set the SemVer prerelease identifier, use the matching branch rule, or disable the qualifier |
| `--channel <name\|true\|false>`      | Set the npm dist-tag, use the matching branch rule, or disable the channel                   |
| `--allow-empty`                      | Run the workflow even when no releasable changes are detected                                |
| `--dry-run`                          | Preview the release without writing files or creating or publishing release assets           |
| `--debug`                            | Enable verbose logging for troubleshooting                                                   |

For `--qualifier` and `--channel`, `true` uses the matching rule's value when
one is defined. Without a rule value, `--qualifier true` creates a prerelease
without an explicit identifier, while `--channel true` uses the sanitized
current branch name. Pass `false` to disable only the corresponding setting.
