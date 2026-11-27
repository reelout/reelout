// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

/**
 * Describe the runtime type of a configuration value for error messages.
 *
 * @param value Configuration value to describe
 * @returns The human-readable type name
 */
const describeValueType = (value: unknown): string => {
  if (value === null) {
    return 'null'
  }

  if (Array.isArray(value)) {
    return 'array'
  }

  return typeof value
}

/**
 * Throw a subject-first error for an invalid configuration value.
 *
 * @param filepath Path of the configuration file being validated
 * @param key Dotted path of the invalid value
 * @param expected Description of the expected shape
 * @param received The invalid value
 */
function fail(
  filepath: string,
  key: string,
  expected: string,
  received: unknown
): never {
  throw new Error(
    `Configuration file "${filepath}" contains an invalid "${key}" value: expected ${expected}, received ${describeValueType(received)}.`
  )
}

/**
 * Validate the raw shape of a user-provided release configuration.
 *
 * Rejects values whose shape ReelOut cannot consume meaningfully — such as a
 * non-array `rules`, a `classifier` that is neither an object nor a
 * function, or a non-object `author` — with a subject-first error naming
 * the configuration file and the offending key. Absent values fall back to
 * defaults and stay valid; `author` fields that are `null` keep their
 * documented fallback to the default author.
 *
 * @param config User-provided configuration value read by cosmiconfig
 * @param filepath Path of the configuration file the value came from
 * @throws If a present configuration value has an invalid shape
 */
export function validateUserConfig(config: unknown, filepath: string): void {
  if (config === null || config === undefined) {
    return
  }

  if (typeof config !== 'object' || Array.isArray(config)) {
    fail(filepath, 'configuration', 'an object', config)
  }

  const record = config as Record<string, unknown>

  const author = record.author

  if (author !== undefined) {
    if (
      typeof author !== 'object' ||
      author === null ||
      Array.isArray(author)
    ) {
      fail(filepath, 'author', 'an object', author)
    }

    const { name, email } = author as Record<string, unknown>

    if (name !== undefined && name !== null && typeof name !== 'string') {
      fail(filepath, 'author.name', 'a string', name)
    }

    if (email !== undefined && email !== null && typeof email !== 'string') {
      fail(filepath, 'author.email', 'a string', email)
    }
  }

  const classifier = record.classifier

  if (classifier !== undefined && typeof classifier !== 'function') {
    if (
      typeof classifier !== 'object' ||
      classifier === null ||
      Array.isArray(classifier)
    ) {
      fail(filepath, 'classifier', 'an object or function', classifier)
    }

    for (const [key, value] of Object.entries(classifier)) {
      if (!Array.isArray(value)) {
        fail(filepath, `classifier.${key}`, 'an array', value)
      }
    }
  }

  const rules = record.rules

  if (rules !== undefined && !Array.isArray(rules)) {
    fail(filepath, 'rules', 'an array', rules)
  }

  const plugins = record.plugins

  if (plugins !== undefined && !Array.isArray(plugins)) {
    fail(filepath, 'plugins', 'an array', plugins)
  }
}
