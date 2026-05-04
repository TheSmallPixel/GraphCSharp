# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-05-05

### Added
- MIT license, contributing guide, issue and PR templates.
- CI workflow that builds the analyzer and runs xUnit tests on every push and PR.
- README rewritten in product-page format with badges, inputs table, and architecture overview.
- `.gitignore` covering .NET, IDE, OS, and editor-backup artifacts.

### Changed
- Action runtime upgraded to .NET 8 LTS (was .NET 7, out of support).
- `actions/checkout` and `actions/setup-dotnet` bumped to v4.

### Removed
- Tracked macOS metadata (`.DS_Store`) and editor backup (`docs/enhanced_visualizer.js.backup`).
