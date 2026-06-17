# Change Log

All notable changes to the "vscode-powerquery-sdk" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## v0.7.3

- Fixed: test settings discovery no longer uses workspace-wide recursive `*.testsettings.json` scans during activation, reducing CPU churn in large or cloud-synced workspaces

## v0.7.2

- Fixed: `*.parameterquery.pq` files now appear in the set credential query file picker, prioritized above other query files