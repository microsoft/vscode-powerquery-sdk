# Copilot Instructions

Use these instructions for changes to the Power Query SDK extension for Visual Studio Code.

## Working Principles

- Inspect the relevant implementation, tests, and configuration before editing. Prefer the repository's current code over assumptions or examples in documentation.
- Make focused changes that solve the requested problem without unrelated refactoring.
- Reuse existing services, abstractions, and utilities before adding new ones.
- Preserve existing behavior unless the task explicitly requires a behavior change.
- Ask for clarification when a product decision or expected behavior cannot be determined from the issue, tests, or code.
- Do not edit generated output such as `dist/`, `out/`, `webviewDist/`, packaged VSIX files, or installed dependencies.
- Do not update package versions or `CHANGELOG.md` unless the task is release-related or changes end-user behavior.

## Repository Overview

This repository contains the `PowerQuery.vscode-powerquery-sdk` extension. It supports Power Query custom connector development, including project creation, connector builds, credential management, query execution, test discovery, and result display.

The extension depends on:

- `PowerQuery.vscode-powerquery` for the M language service.
- `Microsoft.PowerQuery.SdkTools` for tools such as `PQTest.exe`, `PQServiceHost.exe`, and `MakePQX.exe`.

The SDK tools are Windows-only. Use Windows-compatible paths, process handling, and test environments for functionality that invokes them.

## Architecture

- `src/extension.ts` is the composition root. Keep activation focused on constructing services, registering VS Code integrations, and adding disposables to `ExtensionContext.subscriptions`.
- `src/commands/` contains command orchestration and extracted command handlers. Prefer adding focused handlers or services instead of expanding `LifecycleCommands`.
- `src/common/PQTestService.ts` defines the shared PQTest contracts.
- `src/pqTestConnector/` contains the executable and service-host implementations of those contracts. Keep behavior consistent across implementations when both support an operation.
- `src/testing/pqtest-adapter/` implements VS Code Test Explorer discovery and execution.
- `src/services/` contains reusable wrappers around file system, UI, localization, and project-management behavior. Depend on abstractions from `src/testing/abstractions/` where testability requires it.
- `src/panels/` hosts extension-side webview integration.
- `webviews/pq-test-result-view/` is a separate React application with its own dependencies and build configuration.
- `src/constants/PowerQuerySdkExtension.ts`, `src/constants/PowerQuerySdkConfiguration.ts`, and `package.json` are authoritative for identifiers, supported SDK versions, settings, commands, and npm scripts. Do not duplicate volatile values in documentation or tests without a specific reason.

## TypeScript and VS Code Conventions

- Follow the existing ESLint and Prettier configuration. Use four-space indentation, explicit types where required by lint rules, and explicit function return types.
- Keep imports sorted according to `eslint-plugin-simple-import-sort`.
- Handle promises deliberately. Await them or mark intentionally unobserved promises with `void`; do not introduce floating promises.
- Preserve dependency injection boundaries. Keep business logic separate from direct VS Code API calls when practical so it can be unit tested.
- Register and dispose VS Code resources consistently. Prefer `ExtensionContext.subscriptions` or the repository's `IDisposable` patterns.
- Surface operational failures through the established output channel or UI flow. Do not silently swallow errors or return success-shaped fallback values.
- Use existing localization keys and `package.nls*.json` files for user-visible text. Do not hard-code new user-facing strings when the surrounding feature is localized.
- Follow nearby naming and casing, including the existing PQTest API method names when implementing its interfaces.
- Add the repository's standard Microsoft license header to new TypeScript files.

## Testing

Choose the lowest-cost test that verifies the behavior:

- `unit-tests/**/*.spec.ts`: Mocha unit and service tests. Prefer these for validation, path handling, parsing, command handlers, and other logic that does not require a running VS Code instance.
- `src/test/suite/**/*.test.ts`: `@vscode/test-electron` integration tests. Use these only for behavior that needs VS Code APIs, extension activation, commands, Test Explorer, schemas, tree views, or webviews.
- Tests that require network access or other external systems must include `[External]` in the suite or test title so the no-external test command can exclude them.
- Reuse existing fixtures and helpers under `src/test/` and `unit-tests/`. Use fake credentials and sanitized connector settings; never commit real secrets.
- Avoid fixed sleeps in integration tests. Wait for observable state, events, files, or VS Code API results.

Run commands from the repository root unless a command explicitly targets the webview:

```powershell
npm run compile
npm run lint
npm run test:unit-test
npm run test:unit-test:no-external
npm run test:e2e
npm test
```

Use the smallest relevant command first. `npm test` runs both unit and VS Code integration tests and is appropriate for broad or cross-cutting changes.

### Manual Testing and Debugging in VS Code

- Before launching or claiming readiness for manual testing, read `.vscode/launch.json` and `.vscode/tasks.json`. Run the selected launch configuration's actual `preLaunchTask`, including all `dependsOn` tasks, in this worktree. Do not assume that `npm run compile` covers every launch configuration.
- **Run Extension** uses `${defaultBuildTask}`, currently `Watch_VSC_PQ_SDK` (`npm run watch` from the repository root). Wait for its initial compilation to succeed before launching the Extension Development Host.
- **Run Extension [Dev Mode]** uses `Develop_Extensions`, currently both `Watch_VSC_PQ_SDK` and `Dev_PQTest_Result_WebView` (`npm start` from `webviews/pq-test-result-view/`). Wait for both initial compilations and verify that the webview development server is responsive. Preserve `WEBVIEW_DEV_MODE=true` from the launch configuration.
- **Extension UI Tests** uses `npm: compile-tests`. The separate `tasks: watch-tests` task also starts the extension watcher, webview development server, and root `npm run watch-tests`; wait for all three to be ready when using that task.
- Keep required watchers and servers running while the debugging session uses them. Reuse ready tasks in this worktree rather than starting duplicates, and stop processes started solely for a completed validation.
- Check the Problems panel and task output for the files changed, not just the root build result. `npm run lint` scans only `src`; explicitly lint changed unit tests with `npx eslint <changed-test-paths> --config eslint.config.js`. For changes to `webpack.config.js`, also run `npx tsc --allowJs --checkJs --noEmit --strict --skipLibCheck --target ES2020 --module commonjs webpack.config.js` to catch editor-visible JSDoc and JavaScript type errors.
- Fix errors before launch; do not bypass a failed prelaunch task with **Debug Anyway** or claim that an Extension Development Host was tested when only compilation was checked. If a task cannot run, report the blocker.

## Webview Changes

- Treat `webviews/pq-test-result-view/` as a separate package. Its dependencies belong in its own `package.json`.
- Keep extension-to-webview messages compatible on both sides. Update message types, producers, consumers, and tests together.
- Follow the existing React 17 and Fluent UI patterns; do not introduce a second UI framework.
- For webview-only validation, run `npm run lint` and `npm run build` from `webviews/pq-test-result-view/`.
- For integrated packaging behavior, run the relevant root build or package command after the targeted webview checks pass.

## PQTest and Credential Safety

- Treat PQTest output as external process output. Validate assumptions before parsing and preserve useful diagnostics when an operation fails.
- Quote and normalize command arguments with existing helpers rather than constructing command lines ad hoc.
- Respect cancellation, process cleanup, and the executable queue's serialization behavior.
- Treat credentials, connection strings, access tokens, and `.testsettings.json` authentication fields as sensitive. Never log secret values, include them in fixtures, or persist them outside the established credential flow.
- Tests that exercise credential operations must use non-production data and clean up state they create.

## Change Checklist

Before considering a change complete:

1. Verify all affected call sites and implementations, especially both PQTest backends and both sides of webview messaging.
2. Add or update the smallest test that would fail without the change.
3. Run the targeted compile, lint, and test commands for the files changed.
4. Update directly affected documentation and localization resources.
5. Review the diff for generated files, secrets, stale comments, unrelated edits, and duplicated configuration values.
