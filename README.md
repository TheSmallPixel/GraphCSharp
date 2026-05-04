<h1 align="center">GraphCSharp</h1>

<p align="center">
  <strong>Visualize any C# codebase as an interactive D3 graph — drop one GitHub Action into your repo.</strong>
</p>

<p align="center">
  <a href="https://github.com/TheSmallPixel/GraphCSharp/actions/workflows/ci.yml"><img src="https://github.com/TheSmallPixel/GraphCSharp/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/TheSmallPixel/GraphCSharp/releases/latest"><img src="https://img.shields.io/github/v/release/TheSmallPixel/GraphCSharp" alt="Release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/TheSmallPixel/GraphCSharp" alt="License"></a>
  <img src="https://img.shields.io/badge/.NET-8.0-512BD4" alt=".NET 8">
  <a href="https://github.com/TheSmallPixel/GraphCSharp/stargazers"><img src="https://img.shields.io/github/stars/TheSmallPixel/GraphCSharp?style=social" alt="Stars"></a>
</p>

<p align="center">
  <a href="https://thesmallpixel.github.io/GraphCSharp/"><strong>→ Open the live demo</strong></a>
</p>

<!-- TODO(media): replace with docs/demo.gif showing the interactive graph in action -->
![Demo](docs/demo.gif)

## What it does

Reading C# architecture from a folder tree is slow. Roslyn can extract the real call graph, but wiring it up — analyzer, JSON schema, D3 layout, GitHub Pages — is a side-project of its own. **GraphCSharp is that side-project, packaged as a single GitHub Action so any repo gets an interactive graph on every push.**

## 30-second example

Add `.github/workflows/code-graph.yml` to your repo:

```yaml
name: Generate Code Graph
on:
  push:
    branches: [main]

permissions:
  contents: write

jobs:
  graph:
    runs-on: ubuntu-latest
    steps:
      - uses: TheSmallPixel/GraphCSharp@v1
        with:
          source-path: ./src
          docs-dir: docs
          commit-changes: 'true'
```

Then enable GitHub Pages on the `docs/` folder. Your live graph appears at `https://<user>.github.io/<repo>/`.

## Inputs

| Name | Default | Description |
| --- | --- | --- |
| `source-path` | `./src` | Directory scanned recursively for `.cs` files. |
| `docs-dir` | `docs` | Where `graph.json` and `index.html` are written. |
| `index-file` | `index.html` | Visualizer HTML filename. Copied from this action if missing. |
| `commit-changes` | `false` | When `true`, commits the generated graph back to your repo. |

## Links

- **Live demo:** https://thesmallpixel.github.io/GraphCSharp/
- **Changelog:** [CHANGELOG.md](CHANGELOG.md)
- **Contributing:** [CONTRIBUTING.md](CONTRIBUTING.md)
- **License:** [LICENSE](LICENSE)

## How it works

1. The action checks out your repo and provisions .NET 8.
2. Builds the Roslyn-based analyzer in `tools/CodeAnalysisTool`.
3. Walks every `.cs` file under `source-path`, emitting nodes (namespaces, classes, methods, properties) and links (containment, calls, inheritance, type usage) as `docs/graph.json`.
4. Drops a D3 visualizer into `docs/index.html` if one isn't already there.
5. Optionally commits both files back so GitHub Pages serves a fresh graph on every push.

## Development

Requires the .NET 8 SDK.

```bash
git clone https://github.com/TheSmallPixel/GraphCSharp
cd GraphCSharp
dotnet test tools/CodeAnalysisTool.Tests/CodeAnalysisTool.Tests.csproj
```

To run the analyzer against any folder of `.cs` files:

```bash
dotnet run --project tools/CodeAnalysisTool -- <source-path> ./docs
```

Open `docs/index.html` to inspect the result locally.

## License

MIT — see [LICENSE](LICENSE).
