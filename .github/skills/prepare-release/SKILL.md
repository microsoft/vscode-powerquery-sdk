---
name: prepare-release
description: Prepare a Power Query SDK extension release by selecting and applying the version, auditing consumer-facing changes, finalizing the changelog, and validating the VSIX. Use when asked to prepare, stage, or review a release.
---

# Prepare a release

Prepare the repository for review. Do not commit, create a tag, push, publish the extension, or create
a GitHub release unless the user explicitly requests that separate release action.

Run release commands from the repository root. This extension uses npm workspaces and a single root
lockfile.

## Establish the release

1. Check the worktree status and preserve unrelated changes.
2. Find the latest reachable `v<SemVer>` release tag. Use its target as the change-review baseline.
3. Use the version supplied by the user. Otherwise increment the current root package patch version.
4. Confirm the target is valid SemVer, is greater than the current version, and has no local or remote
   `v<version>` tag.

Report `v<version>` as the expected release tag. Do not create it during preparation; it must point to
the finalized and validated release commit.

## Audit the changelog

Save every existing entry under `## [Unreleased]` before editing. When preparing the release, move
those entries verbatim, preserving text and order, into a `## v<version>` section. Flag questionable
entries for review instead of rewriting or silently dropping them.

Review every commit and diff from the previous release tag through `HEAD`. Inspect the associated pull
request or implementation when a title does not establish consumer impact. Add a missing entry for
observable changes to extension commands and settings, PQTest behavior, Test Explorer and webview
behavior, packaging, runtime requirements, security, or compatibility.

Do not add entries for tests, CI, documentation, refactoring, code style, development tooling, or
dependency-only maintenance without an observable consumer impact.

Use exactly one category prefix for each new entry: `Added:`, `Changed:`, `Deprecated:`, `Removed:`,
`Fixed:`, or `Security:`. Keep text brief and describe the result rather than the implementation. End
new entries with the pull request reference `(#<number>)`. Copied `Unreleased` entries remain
verbatim and do not receive new references.

Remove the `Unreleased` heading for the prepared release and keep all prior release sections unchanged
and in descending order. Compare the saved entries with the final section and confirm every saved line
is present verbatim.

Assess SemVer independently of the selected target. Recommend a minor version for backward-compatible
new functionality and a major version for breaking changes. Ask before promoting the default patch
version; never promote it silently.

## Apply the version

Use the npm version command without creating a commit or tag:

```powershell
npm version <version> --no-git-tag-version --ignore-scripts
```

Review `package.json` and `package-lock.json`. Confirm the root extension version changed to the target
and no unrelated dependency or metadata changes were introduced. The webview is private and does not
need an independent release version.

## Validate and hand off

Use the repository's preparation sequence:

```powershell
npm ci
npm audit --omit=dev --audit-level=low
npm audit --audit-level=high
npm run compile
npm run build
npm run lint
npx tsc -p tsconfig.json --noEmit
npm run test:unit-test:no-external
npm run vsix
```

Run `npm test` as well when the environment supports the VS Code Electron test host and required SDK
Tools. Report unavailable external or Windows-only validation as a blocker rather than treating it as a
pass.

Require the production dependency audit to complete with zero vulnerabilities at every severity.
Require the full audit to have no high or critical vulnerabilities, and review and report lower-severity
development-only findings. Do not run `npm audit fix` during release preparation.

An audit service, registry, authentication, rate-limit, or network error is not a clean audit. Report
the blocker and rerun through the approved registry.

Confirm the VSIX was created for `win32-x64`, that its manifest reports the target version, and that no
generated output is staged for commit.

Return the target version, previous tag, expected tag, changelog additions or flags, audit results,
validation results, VSIX artifact, and remaining release actions. Normally the remaining actions are to
review and merge the preparation change, validate the finalized commit, create the annotated
`v<version>` tag, and use the approved publication and GitHub release process.
