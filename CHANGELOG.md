# Change Log

All notable changes to the "vscode-powerquery-sdk" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## v0.8.0

- Removed the experimental `PQServiceHost` backend. All operations now use `PQTest.exe`, regardless of the SdkTools version.
- Deprecated `powerquery.sdk.features.useServiceHost`. The setting is ignored and can be removed; no informational notice or reload prompt is shown.
- Query commands, query tasks, and run/debug now require saving dirty query documents before execution. Untitled queries must first be saved to a local file.
- Operations may take longer because they no longer reuse a warm service process. Existing credentials, cached packages, custom tool locations, and tool-version selection are preserved.

## v0.7.3

- Updated extension and webview dependencies to resolve all reported npm audit vulnerabilities.
- Updated the development and build toolchain to require Node.js 22.13.0 or later on the Node 22 line, or Node.js 24 or later, and VS Code 1.100.0 or later.

## v0.7.2

- Fixed: `*.parameterquery.pq` files now appear in the set credential query file picker, prioritized above other query files