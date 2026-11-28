// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { Package } from '@reelout/core'
import { loadCargoPackages } from '@reelout/cargo'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { temporaryDirectoryTask } from 'tempy'
import { expect, test } from 'vitest'

async function writeManifest(
  dir: string,
  lines: readonly string[]
): Promise<void> {
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, 'Cargo.toml'), `${lines.join('\n')}\n`)
}

function fulfilledPackage(
  result: PromiseSettledResult<Package> | undefined
): Package {
  if (result?.status !== 'fulfilled') {
    throw new Error('Expected a fulfilled load result')
  }

  return result.value
}

function rejectionMessage(
  result: PromiseSettledResult<Package> | undefined
): string {
  if (result?.status !== 'rejected') {
    throw new Error('Expected a rejected load result')
  }

  return (result.reason as Error).message
}

test('returns no crates when the repository has no Cargo manifest', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    expect(await loadCargoPackages(cwd)).toEqual([])
  })
})

test('rejects when the root manifest cannot be parsed', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    await writeManifest(cwd, ['not = [valid'])

    const results = await loadCargoPackages(cwd)

    expect(results).toHaveLength(1)
    expect(results[0]?.status).toBe('rejected')
    expect(rejectionMessage(results[0])).toContain('could not be parsed.')
  })
})

test('loads a single-crate manifest as one crate owning every file', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    await writeManifest(cwd, [
      '[package]',
      'name = "a"',
      'version = "1.2.3"',
      'repository = "https://github.com/user/repo"',
      '',
      '[dependencies]',
      'serde = "1.0.0"',
      '',
      '[dev-dependencies]',
      'tempfile = "3.0.0"',
    ])

    const results = await loadCargoPackages(cwd)

    expect(results).toHaveLength(1)
    expect(fulfilledPackage(results[0])).toEqual({
      name: 'a',
      version: '1.2.3',
      private: false,
      root: true,
      entry: true,
      dependencies: ['serde', 'tempfile'],
      location: '.',
      files: '**/*',
    })
  })
})

test('ignores target entries that are not tables', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    await writeManifest(cwd, [
      '[package]',
      'name = "a"',
      'version = "1.2.3"',
      '',
      '[target]',
      'cfg = "unix"',
    ])

    const results = await loadCargoPackages(cwd)

    expect(results).toHaveLength(1)
    expect(fulfilledPackage(results[0])).toEqual({
      name: 'a',
      version: '1.2.3',
      private: false,
      root: true,
      entry: true,
      dependencies: [],
      location: '.',
      files: '**/*',
    })
  })
})

test('loads the root crate and the workspace members in directory order', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    await writeManifest(cwd, [
      '[package]',
      'name = "root-crate"',
      'version = "0.2.0"',
      '',
      '[workspace]',
      'members = ["crates/*"]',
      '',
      '[workspace.package]',
      'version = "0.2.0"',
      '',
      '[dependencies]',
      'child = "^0.2.0"',
    ])
    await writeManifest(path.join(cwd, 'crates/bad-version'), [
      '[package]',
      'name = "bad-version"',
      'version = "not-semver"',
    ])
    await writeManifest(path.join(cwd, 'crates/child'), [
      '[package]',
      'name = "child"',
      'version.workspace = true',
      '',
      '[dependencies]',
      'zzz = "0.2.0"',
    ])
    await writeManifest(path.join(cwd, 'crates/no-package'), ['[workspace]'])
    await writeManifest(path.join(cwd, 'crates/zzz'), [
      '[package]',
      'name = "zzz"',
      'version = "0.1.0"',
      'publish = false',
      '',
      '[target."cfg(unix)".dependencies]',
      'child = "0.2.0"',
    ])

    const results = await loadCargoPackages(cwd)

    expect(results).toHaveLength(5)

    expect(fulfilledPackage(results[0])).toEqual({
      name: 'root-crate',
      version: '0.2.0',
      private: false,
      root: true,
      entry: true,
      dependencies: ['child'],
      location: '.',
      files:
        '!{crates/bad-version/**/*,crates/child/**/*,crates/no-package/**/*,crates/zzz/**/*}',
    })

    expect(results[1]?.status).toBe('rejected')
    expect(rejectionMessage(results[1])).toBe(
      'Package version "not-semver" in "crates/bad-version" is not a valid semantic version.'
    )

    expect(fulfilledPackage(results[2])).toEqual({
      name: 'child',
      version: '0.2.0',
      private: false,
      root: false,
      entry: false,
      dependencies: ['zzz'],
      location: 'crates/child',
      files: ['crates/child/**/*', 'Cargo.toml', 'Cargo.lock'],
    })

    expect(results[3]?.status).toBe('rejected')
    expect(rejectionMessage(results[3])).toBe(
      'Cargo manifest in "crates/no-package" does not define a [package] table.'
    )

    expect(fulfilledPackage(results[4])).toEqual({
      name: 'zzz',
      version: '0.1.0',
      private: true,
      root: false,
      entry: false,
      dependencies: ['child'],
      location: 'crates/zzz',
      files: ['crates/zzz/**/*', 'Cargo.toml', 'Cargo.lock'],
    })
  })
})

test('rejects a crate name with characters outside [A-Za-z0-9_-]', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    await writeManifest(cwd, [
      '[package]',
      'name = "../evil"',
      'version = "0.1.0"',
    ])

    const results = await loadCargoPackages(cwd)

    expect(results).toHaveLength(1)
    expect(results[0]?.status).toBe('rejected')
    expect(rejectionMessage(results[0])).toBe(
      'Crate name "../evil" in "." contains characters outside [A-Za-z0-9_-].'
    )
  })
})

test('accepts crate names containing hyphens and underscores', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    await writeManifest(cwd, [
      '[package]',
      'name = "my_crate-name"',
      'version = "0.1.0"',
    ])

    const results = await loadCargoPackages(cwd)

    expect(results).toHaveLength(1)
    expect(fulfilledPackage(results[0])?.name).toBe('my_crate-name')
  })
})

test('loads only the members of a virtual manifest', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    await writeManifest(cwd, [
      '[workspace]',
      'members = ["crates/child"]',
      '',
      '[workspace.package]',
      'version = "1.0.0"',
    ])
    await writeManifest(path.join(cwd, 'crates/child'), [
      '[package]',
      'name = "child"',
      'version.workspace = true',
    ])

    const results = await loadCargoPackages(cwd)

    expect(results).toHaveLength(1)
    expect(fulfilledPackage(results[0])).toEqual({
      name: 'child',
      version: '1.0.0',
      private: false,
      root: false,
      entry: false,
      dependencies: [],
      location: 'crates/child',
      files: ['crates/child/**/*', 'Cargo.toml', 'Cargo.lock'],
    })
  })
})

test('respects workspace exclude patterns', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    await writeManifest(cwd, [
      '[workspace]',
      'members = ["crates/*"]',
      'exclude = ["crates/skip"]',
    ])
    await writeManifest(path.join(cwd, 'crates/child'), [
      '[package]',
      'name = "child"',
      'version = "1.0.0"',
    ])
    await writeManifest(path.join(cwd, 'crates/skip'), [
      '[package]',
      'name = "skip"',
      'version = "1.0.0"',
    ])

    const results = await loadCargoPackages(cwd)

    expect(results).toHaveLength(1)
    expect(fulfilledPackage(results[0])).toMatchObject({
      name: 'child',
      location: 'crates/child',
    })
  })
})

test('marks crates restricted to a private-registry publish allowlist as private', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    await writeManifest(cwd, [
      '[package]',
      'name = "a"',
      'version = "1.2.3"',
      'publish = ["private-registry"]',
    ])

    const results = await loadCargoPackages(cwd)

    expect(results).toHaveLength(1)
    expect(fulfilledPackage(results[0])).toMatchObject({
      name: 'a',
      private: true,
    })
  })
})

test('marks crates restricted to an empty publish allowlist as private', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    await writeManifest(cwd, [
      '[package]',
      'name = "a"',
      'version = "1.2.3"',
      'publish = []',
    ])

    const results = await loadCargoPackages(cwd)

    expect(results).toHaveLength(1)
    expect(fulfilledPackage(results[0])).toMatchObject({
      name: 'a',
      private: true,
    })
  })
})

test('marks crates publishable to crates-io through a publish allowlist as public', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    await writeManifest(cwd, [
      '[package]',
      'name = "a"',
      'version = "1.2.3"',
      'publish = ["crates-io"]',
    ])

    const results = await loadCargoPackages(cwd)

    expect(results).toHaveLength(1)
    expect(fulfilledPackage(results[0])).toMatchObject({
      name: 'a',
      private: false,
    })
  })
})

test('marks crates publishable to crates-io among other registries as public', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    await writeManifest(cwd, [
      '[package]',
      'name = "a"',
      'version = "1.2.3"',
      'publish = ["private-registry", "crates-io"]',
    ])

    const results = await loadCargoPackages(cwd)

    expect(results).toHaveLength(1)
    expect(fulfilledPackage(results[0])).toMatchObject({
      name: 'a',
      private: false,
    })
  })
})

test('marks crates with an explicit publish restriction as private', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    await writeManifest(cwd, [
      '[package]',
      'name = "a"',
      'version = "1.2.3"',
      'publish = false',
    ])

    const results = await loadCargoPackages(cwd)

    expect(results).toHaveLength(1)
    expect(fulfilledPackage(results[0])).toMatchObject({
      name: 'a',
      private: true,
    })
  })
})

test('marks crates with an explicit publish permission as public', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    await writeManifest(cwd, [
      '[package]',
      'name = "a"',
      'version = "1.2.3"',
      'publish = true',
    ])

    const results = await loadCargoPackages(cwd)

    expect(results).toHaveLength(1)
    expect(fulfilledPackage(results[0])).toMatchObject({
      name: 'a',
      private: false,
    })
  })
})

test('loads crates without a name', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    await writeManifest(cwd, ['[package]', 'version = "1.2.3"'])

    const results = await loadCargoPackages(cwd)

    expect(results).toHaveLength(1)
    expect(fulfilledPackage(results[0])).toMatchObject({
      name: undefined,
      version: '1.2.3',
    })
  })
})

test('rejects crates without a version', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    await writeManifest(cwd, ['[package]', 'name = "a"'])

    const results = await loadCargoPackages(cwd)

    expect(results).toHaveLength(1)
    expect(rejectionMessage(results[0])).toBe(
      'Package version "undefined" in "." is not a valid semantic version.'
    )
  })
})

test('rejects members that inherit a version the workspace does not define', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    await writeManifest(cwd, ['[workspace]', 'members = ["crates/child"]'])
    await writeManifest(path.join(cwd, 'crates/child'), [
      '[package]',
      'name = "child"',
      'version.workspace = true',
    ])

    const results = await loadCargoPackages(cwd)

    expect(results).toHaveLength(1)
    expect(rejectionMessage(results[0])).toBe(
      'Package version "undefined" in "crates/child" is not a valid semantic version.'
    )
  })
})
