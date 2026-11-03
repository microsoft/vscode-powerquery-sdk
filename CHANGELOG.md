# Change Log

All notable changes to the "vscode-powerquery-sdk" extension.

## v0.8.1

- Added: Actionable SDK Tools download failure guidance for blocked feeds, authenticated proxies, and other network issues, with actions to configure NuGet, open troubleshooting, or show detailed Output diagnostics.
- Added: README guidance for configuring `powerquery.sdk.externals.nugetFeed` and `powerquery.sdk.externals.nugetPath` with organization-approved or local package feeds.
- Added: Development/test-only `PQSDK_TEST_TOOLS_PATH` and `PQSDK_TEST_TOOLS_AUTODISCOVER` overrides to reuse local SDK Tools without package requests, plus isolated opt-in internal-feed acquisition tests.
- Changed: Renamed the SDK Tools update command to "Update PQ SDK Tools".
- Fixed: TypeScript and webpack configuration diagnostics that interfered with extension development.
- Fixed: Focused integration test runs now preserve command-line test filters.

## v0.8.0

- Removed: The experimental `PQServiceHost` backend. All operations now use `PQTest.exe`. A new service host will be introduced in the future.
- Deprecated: `powerquery.sdk.features.useServiceHost` setting. The setting is ignored and can be removed.
- Changed: PQTest commands, tasks, Test Explorer runs, and run/debug now offer "Save All and Run" before execution when any file-backed documents have unsaved changes. Declining or a failed save cancels execution. Unrelated untitled documents are left alone; an untitled query selected for execution must first be saved to a local file.
- Changed: Increased the maximum Recommended SDK Tools NuGet package version to `2.170.x`.

## v0.7.4

- Added: Automatic SDK tool package cleanup controlled by `powerquery.sdk.externals.packagesToKeep` (default `2`), preserving the selected version.
- Fixed: Package cleanup protects selections across SDK hosts and startup preserves usable selected tools even after newer cached versions are removed.
- Fixed: SDK initialization retries cleanup contention without aborting activation, recognizes differently cased Windows paths, and ignores unrelated usage-owner checks when selecting tools.
- Fixed: Normalized tool paths retain their protection, pending executable overrides cannot fall back to another SDK, and unrelated package recovery does not restart active service hosts.
- Fixed: Package coordination validates OS process creation times asynchronously without blocking VS Code, so reused process IDs cannot retain stale cleanup guards or usage leases.
- Fixed: Test discovery, test runs, executable debugging, and build tasks wait for SDK package protection instead of failing during cold activation.
- Changed: NuGet unit tests use mocked feeds and processes so they run without public NuGet access.
- Changed: Capped the Recommended SDK Tools NuGet package version at `2.160.2`.

## v0.7.3

- Updated extension and webview dependencies to resolve all reported npm audit vulnerabilities.
- Updated the development and build toolchain to require Node.js 22.13.0 or later on the Node 22 line, or Node.js 24 or later, and VS Code 1.100.0 or later.

## v0.7.2

- Fixed: `*.parameterquery.pq` files now appear in the set credential query file picker, prioritized above other query files
