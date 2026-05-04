# Contributing

Thanks for taking the time. PRs and issues are welcome.

## Setup

You need the [.NET 8 SDK](https://dotnet.microsoft.com/download).

```bash
git clone https://github.com/TheSmallPixel/GraphCSharp
cd GraphCSharp
dotnet build tools/CodeAnalysisTool
dotnet test  tools/CodeAnalysisTool.Tests
```

## Running locally

The analyzer is a standalone CLI:

```bash
dotnet run --project tools/CodeAnalysisTool -- <source-path> <docs-dir>
```

Open `<docs-dir>/index.html` in a browser to view the graph.

## Pull requests

- Keep changes focused — one concern per PR.
- Add or update a test in `tools/CodeAnalysisTool.Tests` for any behavior change.
- Run `dotnet test` locally before pushing.
- Conventional prefixes (`fix:`, `feat:`, `docs:`, `refactor:`, `test:`, `chore:`) are appreciated.

## Reporting bugs

Use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.md). Include
the .NET version, the action invocation, and a minimal repro if possible.

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).
