## Issue 419 plan

### Summary
- Investigate the test settings discovery path introduced with `TestWatcherManager`.
- Remove or narrow any recursive workspace-wide `*.testsettings.json` scans that can hydrate large/cloud-backed workspaces.
- Keep test discovery limited to explicitly configured `powerquery.sdk.test.settingsFiles` paths or their closest containing directories.

### Findings
- The extension currently activates on `workspaceContains:**/*.testsettings.json` in `/home/runner/work/vscode-powerquery-sdk/vscode-powerquery-sdk/package.json`.
- Test discovery and directory watching still rely on the recursive `**/*.testsettings.json` pattern in `/home/runner/work/vscode-powerquery-sdk/vscode-powerquery-sdk/src/testing/pqtest-adapter/utils/testSettingsUtils.ts` and `/home/runner/work/vscode-powerquery-sdk/vscode-powerquery-sdk/src/testing/pqtest-adapter/TestWatcherManager.ts`.
- `registerTestController` initializes `TestWatcherManager` during extension activation, so any expensive discovery path happens immediately.

### Implementation steps
1. Adjust extension activation so test support no longer depends on a workspace-wide recursive `workspaceContains` search.
2. Refactor test settings discovery so configured file paths are used directly and configured directories are searched as narrowly as possible.
3. Update directory watcher setup so it watches only the intended configured directories and does not reintroduce broad recursive churn.
4. Add regression tests around configured file/directory discovery behavior and the non-recursive activation path.
5. Run the existing lint and relevant unit/e2e validation commands.
6. Update `/home/runner/work/vscode-powerquery-sdk/vscode-powerquery-sdk/CHANGELOG.md` and bump the patch version if the final fix changes user-visible behavior.

### Open question to verify during implementation
- Whether `vscode.workspace.findFiles` is currently being called with default exclude behavior or needs an explicit exclude argument to honor `search.exclude` / `files.exclude` for configured directory scans.
