# Change Log

All notable changes to the "vscode-powerquery-sdk" extension.

## v0.8.0

- Removed: The experimental `PQServiceHost` backend. All operations now use `PQTest.exe`. A new service host will be introduced in the future.
- Deprecated: `powerquery.sdk.features.useServiceHost` setting. The setting is ignored and can be removed.
- Changed: Query commands, query tasks, and run/debug now require saving dirty query documents before execution. Untitled queries must first be saved to a local file.
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
