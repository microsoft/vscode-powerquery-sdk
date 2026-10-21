# Change Log

All notable changes to the "vscode-powerquery-sdk" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## v0.7.3

- Fixed: Removed recursive workspace-wide test-settings activation searches. Test discovery and watchers stay scoped to configured settings paths, and directory discovery honors `search.exclude` and `files.exclude`.
- Fixed: Invalid or missing test settings now log diagnostics instead of displaying error popups.

## v0.7.2

- Fixed: `*.parameterquery.pq` files now appear in the set credential query file picker, prioritized above other query files