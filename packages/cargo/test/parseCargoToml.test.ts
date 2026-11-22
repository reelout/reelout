// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import {
  CARGO_LOCK_FILE,
  CARGO_MANIFEST_FILE,
  hasCargoManifest,
  readCargoToml,
  readCargoTomlText,
} from '@reelout/cargo'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { temporaryDirectoryTask } from 'tempy'
import { expect, test } from 'vitest'

test('exposes the Cargo file names', () => {
  expect(CARGO_MANIFEST_FILE).toBe('Cargo.toml')
  expect(CARGO_LOCK_FILE).toBe('Cargo.lock')
})

test('reads the raw manifest text with comments and formatting intact', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    const text = '[package]\nname = "a" # comment\nversion = "1.2.3"\n'

    await writeFile(path.join(cwd, CARGO_MANIFEST_FILE), text)

    expect(await readCargoTomlText(cwd)).toBe(text)
  })
})

test('parses package, workspace, and dependency tables', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    await writeFile(
      path.join(cwd, CARGO_MANIFEST_FILE),
      [
        '[package]',
        'name = "root-crate"',
        'version = "1.2.3"',
        'repository = "https://github.com/user/repo.git"',
        'publish = false',
        '',
        '[workspace]',
        'members = ["crates/*"]',
        'exclude = ["crates/skip"]',
        '',
        '[workspace.package]',
        'version = "0.2.0"',
        '',
        '[dependencies]',
        'child = "^0.2.0"',
        '',
        '[dev-dependencies]',
        'tempfile = "3.0.0"',
        '',
        '[build-dependencies]',
        'cc = "1.0.0"',
        '',
        '[target."cfg(unix)".dependencies]',
        'unix = "1.0.0"',
        '',
      ].join('\n')
    )

    expect(await readCargoToml(cwd)).toEqual({
      package: {
        name: 'root-crate',
        version: '1.2.3',
        repository: 'https://github.com/user/repo.git',
        publish: false,
      },
      workspace: {
        members: ['crates/*'],
        exclude: ['crates/skip'],
        package: { version: '0.2.0' },
      },
      dependencies: { child: '^0.2.0' },
      'dev-dependencies': { tempfile: '3.0.0' },
      'build-dependencies': { cc: '1.0.0' },
      target: { 'cfg(unix)': { dependencies: { unix: '1.0.0' } } },
    })
  })
})

test('parses workspace-inherited package values', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    await writeFile(
      path.join(cwd, CARGO_MANIFEST_FILE),
      '[package]\nname = "a"\nversion.workspace = true\n'
    )

    expect(await readCargoToml(cwd)).toEqual({
      package: { name: 'a', version: { workspace: true } },
    })
  })
})

test('wraps read failures with the manifest path', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    const error: unknown = await readCargoToml(cwd).catch((err) => err)

    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain(
      `TOML file at "${path.join(cwd, CARGO_MANIFEST_FILE)}"`
    )
    expect((error as Error).message).toContain('could not be read.')
    expect((error as Error).cause).toBeInstanceOf(Error)
  })
})

test('wraps parse failures with the manifest path', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    await writeFile(path.join(cwd, CARGO_MANIFEST_FILE), 'not = [valid')

    const error: unknown = await readCargoToml(cwd).catch((err) => err)

    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain(
      `TOML file at "${path.join(cwd, CARGO_MANIFEST_FILE)}"`
    )
    expect((error as Error).message).toContain('could not be parsed.')
    expect((error as Error).cause).toBeInstanceOf(Error)
  })
})

test('detects whether a directory holds a Cargo manifest', async () => {
  await temporaryDirectoryTask(async (cwd) => {
    expect(await hasCargoManifest(cwd)).toBe(false)

    await writeFile(path.join(cwd, CARGO_MANIFEST_FILE), '[package]\n')

    expect(await hasCargoManifest(cwd)).toBe(true)
  })
})
