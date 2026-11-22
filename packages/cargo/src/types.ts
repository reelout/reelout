// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

/**
 * Configuration options for the Cargo release plugin.
 */
export interface PluginOptions {
  /**
   * Pass `--allow-dirty` to `cargo publish` so working trees with
   * uncommitted changes can still be published.
   */
  allowDirty?: boolean | undefined

  /**
   * Pass `--no-verify` to `cargo publish` to skip the verification build
   * of the crate before it is published.
   */
  noVerify?: boolean | undefined
}

/**
 * The verdict of a crates.io publish-access check for a crate.
 *
 * - `allowed`: the authenticated registry user may publish the crate.
 * - `denied`: the registry reports the crate as owned and the authenticated
 *   user is not among its user owners.
 * - `unknown`: publish access could not be determined, for example because
 *   the crate is owned by a team, the ownership endpoint failed, or the
 *   sparse index could not be read.
 */
export type PublishAccessVerdict = 'allowed' | 'denied' | 'unknown'
