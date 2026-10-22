# Change Log

All notable changes to the "vscode-powerquery-sdk" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## v0.7.4

- Added: Automatic SDK tool package cleanup controlled by `powerquery.sdk.externals.packagesToKeep` (default `2`), preserving the selected version.
- Changed: NuGet unit tests use mocked feeds and processes so they run without public NuGet access.
- Changed: Capped the Recommended SDK Tools NuGet package version at `2.160.2`.

## v0.7.3

- Updated extension and webview dependencies to resolve all reported npm audit vulnerabilities.
- Updated the development and build toolchain to require Node.js 22.13.0 or later on the Node 22 line, or Node.js 24 or later, and VS Code 1.100.0 or later.

## v0.7.2

- Fixed: `*.parameterquery.pq` files now appear in the set credential query file picker, prioritized above other query files