# C# Code Graph

**C# Code Graph** uses Roslyn to analyze your C# source code and generates a JSON graph that is visualized with D3.js. Explore your project’s architecture!

Checkout this [Demo](https://thesmallpixel.github.io/GraphCSharp/).
---

## Quick Start Action

1. **Build & Analyze**
```yaml
    name: "Generate Code Graph"

    on:
    push:
        branches: [ "main" ]

    permissions:
    contents: write 
    jobs:
    generate-graph:
        runs-on: ubuntu-latest
        steps:
        - name: Code Graph
            uses: TheSmallPixel/GraphCSharp@main
            with:
            source-path: "./"
            docs-dir: "docs"
            index-file: "index.html"
            commit-changes: "true"
```