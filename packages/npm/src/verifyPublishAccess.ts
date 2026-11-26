// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Fai

import type { ReleaseContext, ReleasePlan } from '@reelout/core'
import { execCommand, formatError } from '@reelout/core'
import { colors } from 'consola/utils'
import path from 'node:path'
import { extractPackageScope } from './extractPackageScope'
import { getAuthTokenKey } from './getAuthTokenKey'
import { hasAuth, usesOidcTrustedPublishing } from './hasAuth'
import type { PackageManagerInfo } from './inspectPackageManager'
import {
  isCompleteReleasePlan,
  type CompleteReleasePlan,
} from './isCompleteReleasePlan'
import { isJsonObject } from './isJsonObject'
import { NOT_FOUND_PATTERN } from './probePublishedVersion'
import { PLUGIN_NAME } from './PLUGIN_NAME'
import { prepareAuth, type Env } from './prepareAuth'
import { resolvePublishRegistry } from './resolvePublishRegistry'
import { INVALID_CREDENTIALS_MESSAGE } from './verifyAuth'

/**
 * The outcome of verifying publish permission for a release plan.
 *
 * - `allowed`: the registry credentials can publish the package.
 * - `denied`: the registry credentials cannot publish the package.
 * - `unknown`: publish permission could not be determined.
 */
export type PublishAccessVerdict = 'allowed' | 'denied' | 'unknown'

/**
 * Match registry lookup errors that report rejected credentials.
 */
const AUTH_REJECTED_PATTERN =
  /E401|ENEEDAUTH|401 Unauthorized|Response Code: 401|Unable to authenticate|not logged in/i

/**
 * Fail the release when a registry lookup rejects the configured
 * credentials.
 *
 * @param error The error from the failed lookup
 * @throws If the error reports rejected registry credentials
 */
function assertCredentialsAccepted(error: unknown): void {
  if (AUTH_REJECTED_PATTERN.test(String(formatError(error)))) {
    throw new Error(INVALID_CREDENTIALS_MESSAGE, { cause: error })
  }
}

/**
 * State shared across the per-plan publish permission checks.
 */
interface AccessCheckState {
  context: ReleaseContext
  packageManager: PackageManagerInfo
  identities: Map<string, string | undefined>

  /**
   * Whether the spawned npm CLI commands authenticate with the credentials
   * the current plan publishes with, refreshed per plan.
   *
   * Ambient Yarn Berry credentials live in `.yarnrc.yml`, which the npm CLI
   * cannot read, and a token that ambient credentials shadow is never
   * injected, so the npm CLI's rejections stay inconclusive in both cases.
   */
  npmCliSharesCredentials: boolean
}

/**
 * The registry lookup result for a plan's package.
 *
 * - `missing`: the registry reports the package as absent.
 * - `existing`: the registry holds the package, along with its maintainers
 *   when the metadata exposes them.
 */
type PackumentResult =
  | { status: 'missing' }
  | { status: 'existing'; maintainers: string[] | undefined }

/**
 * Verify that each release plan's credentials grant publish permission on its
 * resolved registry, before anything is published.
 *
 * Queries the registry identity and package metadata with the package
 * manager's read commands, then consults npm CLI access endpoints for scoped
 * packages the identity does not maintain. Returns `allowed` when the registry
 * grants the identity publish access, `denied` when the registry shows no
 * publish access, and `unknown` when permission cannot be determined (OIDC
 * trusted publishing on the public npm registry, network failures, or
 * unsupported registries). Denied
 * plans are aggregated into one error that fails the release before any
 * publish, while `unknown` verdicts only warn because the registry rejects
 * unauthorized publishes on its own — except for plans whose trusted
 * publishing `verifyTrustedPublishing` already verified, which stay silent.
 * Incomplete plans and plans from other plugins are skipped.
 *
 * @param context Release context containing environment and working directory
 * @param plans Release plans to verify
 * @param packageManager Information about the active package manager
 * @param pluginName Name of the plugin whose plans are verified, defaulting to the npm plugin
 * @param verifiedTrustedPublishing Plans whose trusted publishing was already
 * verified, whose `unknown` verdicts do not warn
 * @returns A map of each complete plan to its publish access verdict
 * @throws If any plan is denied publish permission
 */
export async function verifyPublishAccess(
  context: ReleaseContext,
  plans: readonly ReleasePlan[],
  packageManager: PackageManagerInfo,
  pluginName: string = PLUGIN_NAME,
  verifiedTrustedPublishing?: ReadonlySet<ReleasePlan>
): Promise<Map<ReleasePlan, PublishAccessVerdict>> {
  const verdicts = new Map<ReleasePlan, PublishAccessVerdict>()

  const publishable = plans.filter((plan) =>
    isCompleteReleasePlan(plan, pluginName)
  )

  const injectToken = Boolean(context.env.NPM_TOKEN?.trim())

  const check: AccessCheckState = {
    context,
    packageManager,
    identities: new Map<string, string | undefined>(),
    npmCliSharesCredentials: false,
  }

  const denied: string[] = []

  for (const plan of publishable) {
    const registry = await resolvePublishRegistry(
      context,
      plan.package,
      packageManager
    )

    // OIDC authentication takes precedence over an injected `NPM_TOKEN`, so
    // the spawned CLI commands would not share the credentials the publish
    // uses and the verdict stays inconclusive. Only the public npm registry
    // supports OIDC trusted publishing, and Yarn never authenticates with
    // OIDC tokens, so those plans stay conclusive.
    const usesOidcAuth = usesOidcTrustedPublishing(
      packageManager,
      context.env,
      registry
    )

    const verdict = usesOidcAuth
      ? 'unknown'
      : await checkPlan(check, plan, registry, injectToken)

    verdicts.set(plan, verdict)

    const target = `${plan.package.name}@${plan.release.version}`

    if (verdict === 'denied') {
      denied.push(`"${target}" (${registry})`)
    } else if (verdict === 'unknown' && !verifiedTrustedPublishing?.has(plan)) {
      context.logger.warn(
        colors.yellow(
          `Could not verify publish permission for "${target}": the registry will reject the publish if access is missing.`
        )
      )
    }
  }

  if (denied.length > 0) {
    throw new Error(`Missing publish permission for ${denied.join(', ')}.`)
  }

  return verdicts
}

/**
 * Determine a single plan's publish access verdict on its resolved registry.
 *
 * Skips with an unknown verdict when no credentials exist for the plan's
 * registry, fetches the registry's package metadata, and applies the layered
 * permission checks: maintainer membership, scoped collaborator and team
 * access, and organization or personal-scope membership for new packages.
 * Refreshes whether the spawned npm CLI shares the credentials the plan
 * publishes with, since ambient credentials can shadow an injected token.
 *
 * @param check Shared verification state for the release
 * @param plan The release plan to verify
 * @param registry The plan's resolved publish registry
 * @param injectToken Whether `NPM_TOKEN` credentials are injected
 * @returns The plan's publish access verdict
 */
async function checkPlan(
  check: AccessCheckState,
  plan: CompleteReleasePlan,
  registry: string,
  injectToken: boolean
): Promise<PublishAccessVerdict> {
  const { context, packageManager } = check

  if (!injectToken && !(await hasAuth(context, plan.package, packageManager))) {
    return 'unknown'
  }

  await using env = injectToken
    ? await prepareAuth(context, plan.package, packageManager)
    : undefined

  check.npmCliSharesCredentials =
    env !== undefined || !packageManager.isYarnBerry

  const packageDir = path.resolve(context.cwd, plan.package.location)

  const packument = await fetchPackument(check, plan, registry, packageDir, env)

  if (packument === undefined) {
    return 'unknown'
  }

  const scope = extractPackageScope(plan.package.name)

  if (packument.status === 'missing') {
    if (scope === null) {
      return 'allowed'
    }

    const identity = await resolveIdentity(check, plan, registry, env)

    if (identity === undefined) {
      return 'unknown'
    }

    if (identity.toLowerCase() === scope.toLowerCase()) {
      return 'allowed'
    }

    return await checkOrgRoster(
      check,
      scope,
      identity,
      registry,
      packageDir,
      env
    )
  }

  const identity = await resolveIdentity(check, plan, registry, env)

  if (identity === undefined) {
    return 'unknown'
  }

  const maintainers = packument.maintainers

  if (maintainers === undefined) {
    return 'unknown'
  }

  if (
    maintainers.some((name) => name.toLowerCase() === identity.toLowerCase())
  ) {
    return 'allowed'
  }

  if (scope === null) {
    return 'denied'
  }

  return await checkCollaborators(
    check,
    plan,
    identity,
    registry,
    packageDir,
    env
  )
}

/**
 * Fetch the registry's metadata for a plan's package.
 *
 * Runs the package manager's metadata command against the bare package name,
 * reporting the package as missing on a not-found response and propagating
 * credential rejections as hard failures.
 *
 * @param check Shared verification state for the release
 * @param plan The release plan whose package is looked up
 * @param registry The plan's resolved publish registry
 * @param packageDir The plan's package directory
 * @param env Prepared authentication environment, if credentials are injected
 * @returns The package's missing status or maintainers, or undefined when the
 * metadata could not be retrieved or parsed
 */
async function fetchPackument(
  check: AccessCheckState,
  plan: CompleteReleasePlan,
  registry: string,
  packageDir: string,
  env: Env | undefined
): Promise<PackumentResult | undefined> {
  const { context, packageManager } = check

  const name = plan.package.name

  let stdout: string

  try {
    if (packageManager.isYarnBerry) {
      stdout = await execCommand('yarn', ['npm', 'info', name, '--json'], {
        cwd: packageDir,
        env: { ...context.env, ...env },
        signal: context.signal,
      })
    } else {
      stdout = await execCommand(
        packageManager.isPnpm ? 'pnpm' : 'npm',
        ['view', name, '--json', '--registry', registry],
        {
          cwd: packageDir,
          env: { ...context.env, ...env },
          signal: context.signal,
        }
      )
    }
  } catch (error) {
    const message = String(formatError(error))

    if (NOT_FOUND_PATTERN.test(message)) {
      return { status: 'missing' }
    }

    assertCredentialsAccepted(error)

    return undefined
  }

  let metadata: unknown

  try {
    const parsed: unknown = JSON.parse(stdout)

    metadata = Array.isArray(parsed) ? parsed[0] : parsed
  } catch {
    return undefined
  }

  if (!isJsonObject(metadata)) {
    return undefined
  }

  return {
    status: 'existing',
    maintainers: readMaintainers(metadata.maintainers),
  }
}

/**
 * Resolve the registry identity of the configured credentials, cached per
 * registry and, for Yarn Berry, package scope.
 *
 * Runs the package manager's `whoami` command against the publish registry.
 * Yarn Berry resolves the publish registry and scoped credentials the same
 * way `yarn npm publish` does, so the command runs from the plan's package
 * directory with the `--publish` flag and, for scoped packages, the
 * `--scope` flag. Credential rejections fail the release, while other
 * failures and unusable output resolve to undefined so callers can fall
 * back to an unknown verdict.
 *
 * @param check Shared verification state for the release
 * @param plan The release plan whose credentials are resolved
 * @param registry The plan's resolved publish registry
 * @param env Prepared authentication environment, if credentials are injected
 * @returns The registry username, or undefined when it cannot be determined
 */
async function resolveIdentity(
  check: AccessCheckState,
  plan: CompleteReleasePlan,
  registry: string,
  env: Env | undefined
): Promise<string | undefined> {
  const { context, packageManager, identities } = check

  const scope = extractPackageScope(plan.package.name)

  const identityKey = packageManager.isYarnBerry
    ? `${registry}\0${scope ?? ''}`
    : registry

  if (identities.has(identityKey)) {
    return identities.get(identityKey)
  }

  let identity: string | undefined

  try {
    let stdout: string

    if (packageManager.isYarnBerry) {
      const args = ['npm', 'whoami']

      if (scope !== null) {
        args.push('--scope', scope)
      }

      args.push('--publish')

      stdout = await execCommand('yarn', args, {
        cwd: path.resolve(context.cwd, plan.package.location),
        env: { ...context.env, ...env },
        signal: context.signal,
      })
    } else {
      stdout = await execCommand(
        packageManager.isPnpm ? 'pnpm' : 'npm',
        ['whoami', '--registry', registry],
        {
          cwd: context.cwd,
          env: { ...context.env, ...env },
          signal: context.signal,
        }
      )
    }

    const candidate = stdout.trim().split('\n')[0]?.trim() ?? ''

    identity =
      candidate.length > 0 && !/\s/.test(candidate) ? candidate : undefined
  } catch (error) {
    assertCredentialsAccepted(error)

    identity = undefined
  }

  identities.set(identityKey, identity)

  return identity
}

/**
 * Run an npm CLI registry query and parse its JSON response.
 *
 * Credential rejections fail the release only when the npm CLI shares the
 * release's registry credentials (an injected token or non-Yarn-Berry
 * ambient credentials); Yarn Berry ambient credential rejections, command
 * failures, and unparseable output resolve to undefined.
 *
 * @param check Shared verification state for the release
 * @param args The npm CLI arguments, including the subcommand
 * @param cwd The directory the command runs in
 * @param npmEnv Environment for the spawned npm CLI
 * @returns The parsed JSON response, or undefined when the query failed
 */
async function queryNpmCli(
  check: AccessCheckState,
  args: readonly string[],
  cwd: string,
  npmEnv: NodeJS.ProcessEnv
): Promise<unknown> {
  let stdout: string

  try {
    stdout = await execCommand('npm', args, {
      cwd,
      env: npmEnv,
      signal: check.context.signal,
    })
  } catch (error) {
    if (check.npmCliSharesCredentials) {
      assertCredentialsAccepted(error)
    }

    return undefined
  }

  try {
    return JSON.parse(stdout)
  } catch {
    return undefined
  }
}

/**
 * Determine publish access for a scoped package through its collaborator
 * list.
 *
 * Queries the npm CLI's collaborator endpoint for the plan's package,
 * granting access on a direct write entry, denying on a read entry, and
 * resolving write-permission teams through their member lists. Credential
 * rejections fail the release only when the npm CLI shares the release's
 * credentials (an injected token or non-Yarn-Berry ambient credentials);
 * Yarn Berry ambient credential rejections degrade to an unknown verdict,
 * as does any other query failure.
 *
 * @param check Shared verification state for the release
 * @param plan The release plan whose package is checked
 * @param identity The registry username of the configured credentials
 * @param registry The plan's resolved publish registry
 * @param packageDir The plan's package directory
 * @param env Prepared authentication environment, if credentials are injected
 * @returns The plan's publish access verdict
 */
async function checkCollaborators(
  check: AccessCheckState,
  plan: CompleteReleasePlan,
  identity: string,
  registry: string,
  packageDir: string,
  env: Env | undefined
): Promise<PublishAccessVerdict> {
  const npmEnv = buildNpmEnv(check, registry, env)

  const collaborators = await queryNpmCli(
    check,
    [
      'access',
      'ls-collaborators',
      plan.package.name,
      '--json',
      '--registry',
      registry,
    ],
    packageDir,
    npmEnv
  )

  if (!isJsonObject(collaborators)) {
    return 'unknown'
  }

  let directAccess: string | undefined

  const writeTeams: string[] = []

  for (const [collaborator, access] of Object.entries(collaborators)) {
    if (typeof access !== 'string') {
      continue
    }

    if (collaborator.toLowerCase() === identity.toLowerCase()) {
      directAccess = access
    } else if (access === 'write' && collaborator.includes(':')) {
      writeTeams.push(collaborator)
    }
  }

  if (directAccess !== undefined) {
    return directAccess === 'write' ? 'allowed' : 'denied'
  }

  let unverified = false

  for (const team of writeTeams) {
    const member = await checkTeamMembership(
      check,
      team,
      identity,
      registry,
      packageDir,
      npmEnv
    )

    if (member === true) {
      return 'allowed'
    }

    if (member === undefined) {
      unverified = true
    }
  }

  return unverified ? 'unknown' : 'denied'
}

/**
 * Determine whether the registry identity is a member of an npm team.
 *
 * Queries the npm CLI's team member list, comparing entries
 * case-insensitively with the resolved identity. Credential rejections fail
 * the release only when the npm CLI shares the release's credentials (an
 * injected token or non-Yarn-Berry ambient credentials); Yarn Berry ambient
 * credential rejections resolve to undefined.
 *
 * @param check Shared verification state for the release
 * @param team The team identifier, in `<scope>:<team>` format
 * @param identity The registry username of the configured credentials
 * @param registry The plan's resolved publish registry
 * @param packageDir The plan's package directory
 * @param npmEnv Environment for the spawned npm CLI
 * @returns True for members, false for non-members, or undefined when the
 * member list could not be retrieved or parsed
 */
async function checkTeamMembership(
  check: AccessCheckState,
  team: string,
  identity: string,
  registry: string,
  packageDir: string,
  npmEnv: NodeJS.ProcessEnv
): Promise<boolean | undefined> {
  const members = await queryNpmCli(
    check,
    ['team', 'ls', team, '--json', '--registry', registry],
    packageDir,
    npmEnv
  )

  if (!Array.isArray(members)) {
    return undefined
  }

  return members.some(
    (member) =>
      typeof member === 'string' &&
      member.toLowerCase() === identity.toLowerCase()
  )
}

/**
 * Determine publish access for a new scoped package through its organization
 * roster.
 *
 * Queries the npm CLI's organization roster, granting access when the
 * identity appears as a member and denying when the roster is readable but
 * does not include the identity. Credential rejections fail the release
 * only when the npm CLI shares the release's credentials (an injected token
 * or non-Yarn-Berry ambient credentials); Yarn Berry ambient credential
 * rejections degrade to an unknown verdict, as does an unreadable or
 * malformed roster.
 *
 * @param check Shared verification state for the release
 * @param scope The package's scope name, without the `@` prefix
 * @param identity The registry username of the configured credentials
 * @param registry The plan's resolved publish registry
 * @param packageDir The plan's package directory
 * @param env Prepared authentication environment, if credentials are injected
 * @returns The plan's publish access verdict
 */
async function checkOrgRoster(
  check: AccessCheckState,
  scope: string,
  identity: string,
  registry: string,
  packageDir: string,
  env: Env | undefined
): Promise<PublishAccessVerdict> {
  const npmEnv = buildNpmEnv(check, registry, env)

  const roster = await queryNpmCli(
    check,
    ['org', 'ls', scope, '--json', '--registry', registry],
    packageDir,
    npmEnv
  )

  if (
    roster === undefined ||
    (!Array.isArray(roster) && !isJsonObject(roster))
  ) {
    return 'unknown'
  }

  return hasRosterEntry(roster, identity) ? 'allowed' : 'denied'
}

/**
 * Build the environment for npm CLI commands spawned by the access checks.
 *
 * Combines the release environment with the prepared credentials and, when a
 * token was injected for the package manager, maps it onto the npm CLI's
 * registry token key so the spawned commands authenticate identically.
 *
 * @param check Shared verification state for the release
 * @param registry The publish registry the commands run against
 * @param env Prepared authentication environment, if credentials are injected
 * @returns The environment for the spawned npm CLI
 */
function buildNpmEnv(
  check: AccessCheckState,
  registry: string,
  env: Env | undefined
): NodeJS.ProcessEnv {
  const token = check.context.env.NPM_TOKEN?.trim()

  return {
    ...check.context.env,
    ...env,
    ...(env !== undefined && token
      ? { [`npm_config_${getAuthTokenKey(registry)}`]: token }
      : {}),
  }
}

/**
 * Read maintainer names from registry package metadata.
 *
 * Accepts the entry shapes registries print for the `maintainers` field:
 * objects carrying a `name`, or `"name <email>"` strings.
 *
 * @param value The metadata's `maintainers` value
 * @returns The maintainer names, or undefined when none can be read
 */
function readMaintainers(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined
  }

  const names: string[] = []

  for (const entry of value) {
    if (typeof entry === 'string') {
      const name = entry.split('<')[0]?.trim() ?? ''

      if (name.length > 0) {
        names.push(name)
      }
    } else if (isJsonObject(entry) && typeof entry.name === 'string') {
      names.push(entry.name)
    }
  }

  return names.length > 0 ? names : undefined
}

/**
 * Determine whether an organization roster lists the registry identity.
 *
 * Matches the identity against roster member names, accepting the object and
 * array shapes the npm CLI prints for its organization commands.
 *
 * @param roster The parsed roster value
 * @param identity The registry username of the configured credentials
 * @returns True when the roster lists the identity as a member
 */
function hasRosterEntry(roster: unknown, identity: string): boolean {
  if (Array.isArray(roster)) {
    return roster.some(
      (entry) =>
        (typeof entry === 'string' &&
          entry.toLowerCase() === identity.toLowerCase()) ||
        hasRosterEntry(entry, identity)
    )
  }

  if (isJsonObject(roster)) {
    return (
      Object.keys(roster).some(
        (member) => member.toLowerCase() === identity.toLowerCase()
      ) ||
      Object.values(roster).some((entry) => hasRosterEntry(entry, identity))
    )
  }

  return false
}
