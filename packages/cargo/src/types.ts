// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

/**
 * A `[package]` value inherited from the workspace manifest through a
 * dotted key such as `version.workspace = true`.
 */
export interface CargoInheritedValue {
  workspace?: boolean | undefined
}

/** The parsed `[package]` table of a Cargo manifest. */
export interface CargoPackageTable {
  name?: string | undefined
  version?: string | CargoInheritedValue | undefined
  repository?: string | undefined
  publish?: boolean | readonly string[] | undefined
}

/** The parsed `[workspace]` table of a Cargo manifest. */
export interface CargoWorkspaceTable {
  members?: readonly string[] | undefined
  exclude?: readonly string[] | undefined
  package?: { version?: string | undefined } | undefined
}

/** The dependency tables scoped to a build target, under `[target.*]`. */
export interface CargoTargetTables {
  dependencies?: Record<string, unknown> | undefined
  'dev-dependencies'?: Record<string, unknown> | undefined
  'build-dependencies'?: Record<string, unknown> | undefined
}

/** The subset of a parsed Cargo manifest ReelOut reads. */
export interface CargoToml {
  package?: CargoPackageTable | undefined
  workspace?: CargoWorkspaceTable | undefined
  dependencies?: Record<string, unknown> | undefined
  'dev-dependencies'?: Record<string, unknown> | undefined
  'build-dependencies'?: Record<string, unknown> | undefined
  target?: Record<string, CargoTargetTables> | undefined
}
