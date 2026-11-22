// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import { version } from '../package.json'

/** The base URL of the crates.io registry API. */
export const CARGO_REGISTRY_API = 'https://crates.io/api/v1'

/** The user agent sent to crates.io endpoints. */
export const USER_AGENT = `reelout-cargo/${version} (+https://github.com/reelout/reelout)`
