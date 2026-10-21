# Dependency Security Updates

## Goal

Update the root extension and the `webviews/pq-test-result-view` dependency trees so that `npm audit` reports zero vulnerabilities for both lockfiles without breaking builds, linting, or tests.

## Baseline

- Root dependency tree: 31 vulnerabilities (25 high, 6 moderate).
- Webview dependency tree: 43 vulnerabilities (3 critical, 29 high, 9 moderate, 2 low).
- Several findings are transitive and some webview fixes are not available from the currently resolved dependency ranges, so direct tooling dependencies may require upgrades or replacement rather than lockfile-only remediation.

## Execution Plan

1. Create `copilot-journal.md` and record the audit baseline, package decisions, validation results, and any blockers.
2. Apply non-breaking audit remediations to the root package and inspect the remaining dependency paths.
3. Upgrade the root direct dependencies responsible for unresolved findings, preferring current compatible releases and avoiding `npm audit fix --force` unless a required major upgrade is reviewed explicitly.
4. Repeat the remediation for `webviews/pq-test-result-view`, including replacing or upgrading build tooling when its dependency chain has no available audit fix.
5. Regenerate both `package-lock.json` files and confirm that production and development dependencies remain reproducible with `npm ci`.
6. Run `npm audit` in the repository root and webview directory and require zero reported vulnerabilities in both.
7. Run the smallest relevant validation after each coherent dependency change, then run final root compile, lint, unit tests, and webview build.
8. Update `CHANGELOG.md` with the dependency security maintenance.
9. Run `npm version patch` without creating an automatic Git tag, ensure the webview metadata remains consistent where applicable, and rerun final audits and validation.
10. Mark all journal checkpoints complete and commit the dependency, lockfile, changelog, version, plan, and journal changes with the required commit trailers.

## Stop Conditions

- Stop and request guidance if eliminating a vulnerability requires removing supported behavior, changing the supported VS Code/Node runtime, or accepting a breaking migration whose compatibility cannot be established.
- Stop on any new build, lint, or test failure that cannot be resolved as a direct consequence of the dependency updates.
