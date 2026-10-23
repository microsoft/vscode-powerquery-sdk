# Change Log

All notable changes to the "vscode-powerquery-sdk" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## v0.7.5

- Added: `powerquery.sdk.test.enabled` can disable the VS Code Test Explorer integration, discovery, watchers, and Test UI commands. Enabled by default; reload the window after changing it.
- Fixed: Removed recursive workspace-wide test-settings activation searches. Test discovery and watchers stay scoped to configured settings paths, and directory discovery honors `search.exclude` and `files.exclude`.
- Fixed: Invalid or missing test settings now log diagnostics instead of displaying error popups.
- Fixed: Rapid settings-file creation and deletion no longer leave stale Test Explorer entries or retained watcher listeners.

## v0.7.3

- Updated extension and webview dependencies to resolve all reported npm audit vulnerabilities.
- Updated the development and build toolchain to require Node.js 22.13.0 or later on the Node 22 line, or Node.js 24 or later, and VS Code 1.100.0 or later.

## v0.7.2

- Fixed: `*.parameterquery.pq` files now appear in the set credential query file picker, prioritized above other query files