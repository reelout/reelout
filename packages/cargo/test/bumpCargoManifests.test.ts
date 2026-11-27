// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { ReleasePlan } from '@reelout/core'
import { bumpCargoManifests } from '@reelout/cargo'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { temporaryDirectoryTask } from 'tempy'
import { expect, test } from 'vitest'

interface CreatePlanOptions {
  name: string | undefined
  location: string
  releaseVersion: string | null
}

function createPlan(options: CreatePlanOptions): ReleasePlan {
  return {
    package: {
      provider: '@reelout/cargo',
      name: options.name,
      version: '1.2.2',
      private: false,
      root: options.location === '.',
      entry: options.location === '.',
      dependencies: [],
      location: options.location,
    },
    history: [],
    release:
      options.releaseVersion == null
        ? null
        : { type: 'patch', version: options.releaseVersion },
  }
}

async function writeManifest(
  dir: string,
  lines: readonly string[]
): Promise<void> {
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, 'Cargo.toml'), `${lines.join('\n')}\n`)
}

const readManifest = (dir: string): Promise<string> =>
  readFile(path.join(dir, 'Cargo.toml'), 'utf-8')

test('bumps the literal version of a single crate', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    await writeManifest(cwd, ['[package]', 'name = "a"', 'version = "1.2.2"'])

    await expect(
      bumpCargoManifests(cwd, [
        createPlan({ name: 'a', location: '.', releaseVersion: '1.2.3' }),
      ])
    ).resolves.toBe(true)

    expect(await readManifest(cwd)).toBe(
      '[package]\nname = "a"\nversion = "1.2.3"\n'
    )
  })
})

test('bumps the shared workspace version for crates that inherit it', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    await writeManifest(cwd, [
      '[package]',
      'name = "root"',
      'version.workspace = true',
      '',
      '[workspace.package]',
      'version = "0.2.0"',
    ])

    await expect(
      bumpCargoManifests(cwd, [
        createPlan({ name: 'root', location: '.', releaseVersion: '0.3.0' }),
      ])
    ).resolves.toBe(true)

    expect(await readManifest(cwd)).toBe(
      [
        '[package]',
        'name = "root"',
        'version.workspace = true',
        '',
        '[workspace.package]',
        'version = "0.3.0"',
        '',
      ].join('\n')
    )
  })
})

test('bumps the workspace version from a member manifest', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    await writeManifest(cwd, [
      '[package]',
      'name = "root"',
      'version = "0.2.0"',
      '',
      '[workspace]',
      'members = ["crates/child"]',
      '',
      '[workspace.package]',
      'version = "0.2.0"',
    ])
    await writeManifest(path.join(cwd, 'crates/child'), [
      '[package]',
      'name = "child"',
      'version.workspace = true',
    ])

    await expect(
      bumpCargoManifests(cwd, [
        createPlan({
          name: 'child',
          location: 'crates/child',
          releaseVersion: '0.3.0',
        }),
      ])
    ).resolves.toBe(true)

    expect(await readManifest(cwd)).toContain(
      '[workspace.package]\nversion = "0.3.0"'
    )
    expect(await readManifest(cwd)).toContain(
      '[package]\nname = "root"\nversion = "0.2.0"'
    )
    expect(await readManifest(path.join(cwd, 'crates/child'))).toBe(
      '[package]\nname = "child"\nversion.workspace = true\n'
    )
  })
})

test('rejects inheriting crates planned at different versions', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    await writeManifest(cwd, [
      '[workspace]',
      'members = ["crates/a", "crates/b"]',
      '',
      '[workspace.package]',
      'version = "1.2.2"',
    ])
    await writeManifest(path.join(cwd, 'crates/a'), [
      '[package]',
      'name = "a"',
      'version.workspace = true',
    ])
    await writeManifest(path.join(cwd, 'crates/b'), [
      '[package]',
      'name = "b"',
      'version.workspace = true',
    ])

    await expect(
      bumpCargoManifests(cwd, [
        createPlan({
          name: 'a',
          location: 'crates/a',
          releaseVersion: '1.2.3',
        }),
        createPlan({
          name: 'b',
          location: 'crates/b',
          releaseVersion: '1.3.0',
        }),
      ])
    ).rejects.toThrow(
      'Crates "a" and "b" inherit the workspace version but were planned at different versions ("1.2.3" and "1.3.0").'
    )

    expect(await readManifest(cwd)).toContain('version = "1.2.2"')
  })
})

test('rejects inheriting crates when the root manifest lacks the workspace package section', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    await writeManifest(cwd, ['[workspace]', 'members = ["crates/a"]'])
    await writeManifest(path.join(cwd, 'crates/a'), [
      '[package]',
      'name = "a"',
      'version.workspace = true',
    ])

    await expect(
      bumpCargoManifests(cwd, [
        createPlan({
          name: 'a',
          location: 'crates/a',
          releaseVersion: '1.2.3',
        }),
      ])
    ).rejects.toThrow(
      'Crate "a" inherits the workspace version, but the shared version literal could not be found under [workspace.package] in the root manifest.'
    )

    expect(await readManifest(cwd)).toBe(
      '[workspace]\nmembers = ["crates/a"]\n'
    )
    expect(await readManifest(path.join(cwd, 'crates/a'))).toBe(
      '[package]\nname = "a"\nversion.workspace = true\n'
    )
  })
})

test('rejects inheriting crates when the workspace package section has no version literal', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    await writeManifest(cwd, [
      '[workspace]',
      'members = ["crates/a"]',
      '',
      '[workspace.package]',
      'edition = "2021"',
    ])
    await writeManifest(path.join(cwd, 'crates/a'), [
      '[package]',
      'name = "a"',
      'version.workspace = true',
    ])

    await expect(
      bumpCargoManifests(cwd, [
        createPlan({
          name: 'a',
          location: 'crates/a',
          releaseVersion: '1.2.3',
        }),
      ])
    ).rejects.toThrow(
      'Crate "a" inherits the workspace version, but the shared version literal could not be found under [workspace.package] in the root manifest.'
    )

    expect(await readManifest(cwd)).toContain('edition = "2021"')
    expect(await readManifest(cwd)).not.toContain('version = ')
  })
})

test('rejects inheriting crates when the workspace package version is declared as an inline table', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    await writeManifest(cwd, [
      '[workspace]',
      'members = ["crates/a"]',
      'package = { version = "1.2.2" }',
    ])
    await writeManifest(path.join(cwd, 'crates/a'), [
      '[package]',
      'name = "a"',
      'version.workspace = true',
    ])

    await expect(
      bumpCargoManifests(cwd, [
        createPlan({
          name: 'a',
          location: 'crates/a',
          releaseVersion: '1.2.3',
        }),
      ])
    ).rejects.toThrow(
      'Crate "a" inherits the workspace version, but the shared version literal could not be found under [workspace.package] in the root manifest.'
    )

    expect(await readManifest(cwd)).toContain('package = { version = "1.2.2" }')
  })
})

test('bumps the shared workspace version once for inheriting crates planned at the same version', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    await writeManifest(cwd, [
      '[workspace]',
      'members = ["crates/a", "crates/b"]',
      '',
      '[workspace.package]',
      'version = "1.2.2"',
    ])
    await writeManifest(path.join(cwd, 'crates/a'), [
      '[package]',
      'name = "a"',
      'version.workspace = true',
    ])
    await writeManifest(path.join(cwd, 'crates/b'), [
      '[package]',
      'name = "b"',
      'version.workspace = true',
    ])

    await expect(
      bumpCargoManifests(cwd, [
        createPlan({
          name: 'a',
          location: 'crates/a',
          releaseVersion: '1.3.0',
        }),
        createPlan({
          name: 'b',
          location: 'crates/b',
          releaseVersion: '1.3.0',
        }),
      ])
    ).resolves.toBe(true)

    expect(await readManifest(cwd)).toContain(
      '[workspace.package]\nversion = "1.3.0"'
    )
    expect(await readManifest(path.join(cwd, 'crates/a'))).toBe(
      '[package]\nname = "a"\nversion.workspace = true\n'
    )
    expect(await readManifest(path.join(cwd, 'crates/b'))).toBe(
      '[package]\nname = "b"\nversion.workspace = true\n'
    )
  })
})

test('updates dependency requirements while preserving prefixes', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    await writeManifest(cwd, [
      '[package]',
      'name = "a"',
      'version = "1.2.2"',
      '',
      '[dependencies]',
      'b = "^1.2.2"',
      'c = "~1.2.2"',
      'd = "=1.2.2"',
      'external = "9.9.9"',
      '',
      '[dev-dependencies]',
      'b = "1.2.2"',
      '',
      '[build-dependencies]',
      'b = "1.2.2"',
    ])
    await writeManifest(path.join(cwd, 'crates/b'), [
      '[package]',
      'name = "b"',
      'version = "1.2.2"',
    ])
    await writeManifest(path.join(cwd, 'crates/c'), [
      '[package]',
      'name = "c"',
      'version = "1.2.2"',
    ])
    await writeManifest(path.join(cwd, 'crates/d'), [
      '[package]',
      'name = "d"',
      'version = "1.2.2"',
    ])

    await expect(
      bumpCargoManifests(cwd, [
        createPlan({ name: 'a', location: '.', releaseVersion: '1.2.3' }),
        createPlan({
          name: 'b',
          location: 'crates/b',
          releaseVersion: '1.2.3',
        }),
        createPlan({
          name: 'c',
          location: 'crates/c',
          releaseVersion: '1.2.3',
        }),
        createPlan({
          name: 'd',
          location: 'crates/d',
          releaseVersion: '1.2.3',
        }),
      ])
    ).resolves.toBe(true)

    expect(await readManifest(cwd)).toBe(
      [
        '[package]',
        'name = "a"',
        'version = "1.2.3"',
        '',
        '[dependencies]',
        'b = "^1.2.3"',
        'c = "~1.2.3"',
        'd = "=1.2.3"',
        'external = "9.9.9"',
        '',
        '[dev-dependencies]',
        'b = "1.2.3"',
        '',
        '[build-dependencies]',
        'b = "1.2.3"',
        '',
      ].join('\n')
    )

    for (const member of ['b', 'c', 'd']) {
      expect(await readManifest(path.join(cwd, `crates/${member}`))).toBe(
        `[package]\nname = "${member}"\nversion = "1.2.3"\n`
      )
    }
  })
})

test('bumps single-quoted versions and requirements', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    await writeManifest(cwd, [
      '[package]',
      "name = 'a'",
      "version = '1.2.2'",
      '',
      '[dependencies]',
      "b = '~1.2.2'",
      "c = { version = '=1.2.2' }",
    ])
    await writeManifest(path.join(cwd, 'crates/b'), [
      '[package]',
      "name = 'b'",
      "version = '1.2.2'",
    ])
    await writeManifest(path.join(cwd, 'crates/c'), [
      '[package]',
      "name = 'c'",
      "version = '1.2.2'",
    ])

    await expect(
      bumpCargoManifests(cwd, [
        createPlan({ name: 'a', location: '.', releaseVersion: '1.2.3' }),
        createPlan({
          name: 'b',
          location: 'crates/b',
          releaseVersion: '1.2.3',
        }),
        createPlan({
          name: 'c',
          location: 'crates/c',
          releaseVersion: '1.2.3',
        }),
      ])
    ).resolves.toBe(true)

    expect(await readManifest(cwd)).toBe(
      [
        '[package]',
        "name = 'a'",
        "version = '1.2.3'",
        '',
        '[dependencies]',
        "b = '~1.2.3'",
        "c = { version = '=1.2.3' }",
        '',
      ].join('\n')
    )

    for (const member of ['b', 'c']) {
      expect(await readManifest(path.join(cwd, `crates/${member}`))).toBe(
        `[package]\nname = '${member}'\nversion = '1.2.3'\n`
      )
    }
  })
})

test('updates inline tables, workspace dependencies, and dependency sub-tables', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    await writeManifest(cwd, [
      '[workspace]',
      'members = ["crates/child", "crates/zzz"]',
      '',
      '[workspace.dependencies]',
      'child = { version = "=0.2.0" }',
      '',
      '[dependencies]',
      'child = { version = "=0.2.0" }',
      'external = { version = "=9.9.9" }',
      '',
      '[dev-dependencies.child]',
      'version = "~0.2.0"',
    ])
    await writeManifest(path.join(cwd, 'crates/child'), [
      '[package]',
      'name = "child"',
      'version = "0.2.0"',
      '',
      '[dependencies]',
      'zzz = { default-features = false, version = "=0.2.0" }',
    ])
    await writeManifest(path.join(cwd, 'crates/zzz'), [
      '[package]',
      'name = "zzz"',
      'version = "0.2.0"',
      '',
      '[target."cfg(unix)".dependencies]',
      'child = "0.2.0"',
    ])

    await expect(
      bumpCargoManifests(cwd, [
        createPlan({
          name: 'child',
          location: 'crates/child',
          releaseVersion: '0.3.0',
        }),
        createPlan({
          name: 'zzz',
          location: 'crates/zzz',
          releaseVersion: '0.3.0',
        }),
      ])
    ).resolves.toBe(true)

    expect(await readManifest(cwd)).toBe(
      [
        '[workspace]',
        'members = ["crates/child", "crates/zzz"]',
        '',
        '[workspace.dependencies]',
        'child = { version = "=0.3.0" }',
        '',
        '[dependencies]',
        'child = { version = "=0.3.0" }',
        'external = { version = "=9.9.9" }',
        '',
        '[dev-dependencies.child]',
        'version = "~0.3.0"',
        '',
      ].join('\n')
    )

    expect(await readManifest(path.join(cwd, 'crates/child'))).toBe(
      [
        '[package]',
        'name = "child"',
        'version = "0.3.0"',
        '',
        '[dependencies]',
        'zzz = { default-features = false, version = "=0.3.0" }',
        '',
      ].join('\n')
    )

    expect(await readManifest(path.join(cwd, 'crates/zzz'))).toBe(
      [
        '[package]',
        'name = "zzz"',
        'version = "0.3.0"',
        '',
        '[target."cfg(unix)".dependencies]',
        'child = "0.3.0"',
        '',
      ].join('\n')
    )
  })
})

test('preserves comments while bumping versions', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    await writeManifest(cwd, [
      '# manifest header comment',
      '[package]',
      '# the crate version',
      'name = "a"',
      'version = "1.2.2" # trailing comment',
    ])

    await expect(
      bumpCargoManifests(cwd, [
        createPlan({ name: 'a', location: '.', releaseVersion: '1.2.3' }),
      ])
    ).resolves.toBe(true)

    expect(await readManifest(cwd)).toBe(
      [
        '# manifest header comment',
        '[package]',
        '# the crate version',
        'name = "a"',
        'version = "1.2.3" # trailing comment',
        '',
      ].join('\n')
    )
  })
})

test('bumps the workspace version shared with a nameless crate', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    await writeManifest(cwd, [
      '[package]',
      'name = "root"',
      'version = "0.2.0"',
      '',
      '[workspace]',
      'members = ["crates/child"]',
      '',
      '[workspace.package]',
      'version = "0.2.0"',
    ])
    await writeManifest(path.join(cwd, 'crates/child'), [
      '[package]',
      'version.workspace = true',
    ])

    await expect(
      bumpCargoManifests(cwd, [
        createPlan({
          name: 'root',
          location: '.',
          releaseVersion: '0.3.0',
        }),
        createPlan({
          name: undefined,
          location: 'crates/child',
          releaseVersion: '0.3.0',
        }),
      ])
    ).resolves.toBe(true)

    expect(await readManifest(cwd)).toContain(
      '[workspace.package]\nversion = "0.3.0"'
    )

    expect(await readManifest(path.join(cwd, 'crates/child'))).toBe(
      '[package]\nversion.workspace = true\n'
    )
  })
})

test('bumps dependencies of crates without a release', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    await writeManifest(cwd, [
      '[package]',
      'name = "other"',
      'version = "0.2.0"',
      '',
      '[dependencies]',
      'b = "~0.2.0"',
    ])
    await writeManifest(path.join(cwd, 'crates/b'), [
      '[package]',
      'name = "b"',
      'version = "0.2.0"',
    ])

    await expect(
      bumpCargoManifests(cwd, [
        createPlan({
          name: 'other',
          location: '.',
          releaseVersion: null,
        }),
        createPlan({
          name: 'b',
          location: 'crates/b',
          releaseVersion: '0.3.0',
        }),
      ])
    ).resolves.toBe(true)

    expect(await readManifest(cwd)).toBe(
      [
        '[package]',
        'name = "other"',
        'version = "0.2.0"',
        '',
        '[dependencies]',
        'b = "~0.3.0"',
        '',
      ].join('\n')
    )
  })
})

test('returns false without writing when no plan carries a release version', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    const text = '[package]\nname = "a"\nversion = "1.2.2"\n'

    await writeManifest(cwd, ['[package]', 'name = "a"', 'version = "1.2.2"'])

    await expect(
      bumpCargoManifests(cwd, [
        createPlan({ name: 'a', location: '.', releaseVersion: null }),
      ])
    ).resolves.toBe(false)

    expect(await readManifest(cwd)).toBe(text)
  })
})

test('returns false when the manifests already carry the target versions', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    const text = '[package]\nname = "a"\nversion = "1.2.3"\n'

    await writeManifest(cwd, ['[package]', 'name = "a"', 'version = "1.2.3"'])

    await expect(
      bumpCargoManifests(cwd, [
        createPlan({ name: 'a', location: '.', releaseVersion: '1.2.3' }),
      ])
    ).resolves.toBe(false)

    expect(await readManifest(cwd)).toBe(text)
  })
})
