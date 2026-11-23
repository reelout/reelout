// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { ReleaseContext } from '#types'

const inactivePlugins = new WeakMap<ReleaseContext, Set<string>>()

/**
 * Reset the plugin activity tracking of a release context.
 *
 * Removes every recorded inactive plugin so a context can be reused across
 * workflow runs.
 *
 * @param context Release execution context whose activity is reset
 */
export function resetPluginActivity(context: ReleaseContext): void {
  inactivePlugins.delete(context)
}

/**
 * Record a plugin as inactive for a release context.
 *
 * @param context Release execution context the plugin participates in
 * @param plugin Name of the plugin that will not act in this release
 */
export function markPluginInactive(
  context: ReleaseContext,
  plugin: string
): void {
  let plugins = inactivePlugins.get(context)

  if (!plugins) {
    plugins = new Set<string>()

    inactivePlugins.set(context, plugins)
  }

  plugins.add(plugin)
}

/**
 * Determine whether a plugin is inactive for a release context.
 *
 * @param context Release execution context the plugin participates in
 * @param plugin Name of the plugin to inspect
 * @returns True when the plugin was marked inactive for the context
 */
export function isPluginInactive(
  context: ReleaseContext,
  plugin: string
): boolean {
  return inactivePlugins.get(context)?.has(plugin) ?? false
}
