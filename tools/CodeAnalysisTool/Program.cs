// tools/CodeAnalysisTool/Program.cs
using System;
using System.IO;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using System.Linq;
using Newtonsoft.Json;
using Newtonsoft.Json.Serialization;

namespace CodeAnalysisTool
{
    class Program
    {
        static void Main(string[] args)
        {
            // 1) Parse CLI arguments
            if (args.Length < 1)
            {
                Console.WriteLine("Usage: CodeAnalysisTool <source-path> [docs-path]");
                return;
            }

            string sourcePath = args[0];
            string docsPath = (args.Length > 1) ? args[1] : "docs";

            // 2) Find all .cs files
            var csFiles = Directory.GetFiles(sourcePath, "*.cs", SearchOption.AllDirectories);

            // 3) Build SyntaxTrees
            var syntaxTrees = csFiles.Select(file =>
                CSharpSyntaxTree.ParseText(File.ReadAllText(file))
            ).ToList();

            // 4) Create compilation
            var compilation = CSharpCompilation.Create(
                "CodeGraphAssembly",
                syntaxTrees,
                new[] { MetadataReference.CreateFromFile(typeof(object).Assembly.Location) }
            );

            // 5) Walk each tree with a single walker
            var walker = new CodeGraphWalker();
            foreach (var tree in syntaxTrees)
            {
                var model = compilation.GetSemanticModel(tree);
                walker.SemanticModel = model;
                walker.Visit(tree.GetRoot());
            }

            var graph = walker.GetGraph();

            // 6) Output to docs/graph.json
            Directory.CreateDirectory(docsPath);
            var outputFile = Path.Combine(docsPath, "graph.json");
            // Create settings specifying our custom naming strategy
            var settings = new JsonSerializerSettings
            {
                // Use a DefaultContractResolver with our LowercaseNamingStrategy
                ContractResolver = new DefaultContractResolver
                {
                    NamingStrategy = new LowercaseNamingStrategy()
                },
                Formatting = Formatting.Indented // for pretty printing
            };
            File.WriteAllText(outputFile, JsonConvert.SerializeObject(graph, settings));

            Console.WriteLine($"Generated: {outputFile}");
        }
    }
}
