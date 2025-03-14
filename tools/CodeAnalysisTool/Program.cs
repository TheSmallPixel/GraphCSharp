// tools/CodeAnalysisTool/Program.cs
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Newtonsoft.Json;
using Newtonsoft.Json.Serialization;

namespace CodeAnalysisTool
{
    class Program
    {
        static void Main(string[] args)
        {
            try
            {
                // 1) Parse CLI arguments
                if (args.Length < 1)
                {
                    Console.WriteLine("Usage: CodeAnalysisTool <source-path> [docs-path]");
                    return;
                }

                string sourcePath = args[0];
                string docsPath = (args.Length > 1) ? args[1] : "docs";

                Console.WriteLine($"Analyzing source code in: {sourcePath}");
                Console.WriteLine($"Output directory: {docsPath}");

                // 2) Find all .cs files
                string[] csFiles;
                try
                {
                    csFiles = Directory.GetFiles(sourcePath, "*.cs", SearchOption.AllDirectories);
                    Console.WriteLine($"Found {csFiles.Length} C# files for analysis");
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"Error reading source directory: {ex.Message}");
                    return;
                }

                if (csFiles.Length == 0)
                {
                    Console.WriteLine("No C# files found. Please check the source directory path.");
                    return;
                }

                // 3) Build SyntaxTrees
                var syntaxTrees = new List<SyntaxTree>();
                foreach (var file in csFiles)
                {
                    try
                    {
                        // Try to parse the file and handle any syntax errors
                        var tree = CSharpSyntaxTree.ParseText(
                            File.ReadAllText(file),
                            path: file // Include the file path for better diagnostics
                        );

                        // Check for syntax errors
                        var diagnostics = tree.GetDiagnostics().Where(d => d.Severity == DiagnosticSeverity.Error);
                        if (diagnostics.Any())
                        {
                            Console.WriteLine($"Warning: Syntax errors in {file}:");
                            foreach (var diag in diagnostics.Take(5)) // Limit to 5 errors
                            {
                                Console.WriteLine($"  {diag.GetMessage()}");
                            }
                            if (diagnostics.Count() > 5)
                            {
                                Console.WriteLine($"  ... and {diagnostics.Count() - 5} more errors");
                            }
                            // Still add the tree with errors to get partial analysis
                        }

                        syntaxTrees.Add(tree);
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"Error parsing file {file}: {ex.Message}");
                        // Continue with other files
                    }
                }

                if (syntaxTrees.Count == 0)
                {
                    Console.WriteLine("No valid C# syntax trees could be created. Analysis cannot continue.");
                    return;
                }

                // 4) Create compilation with more references
                var references = GetMetadataReferences();
                var compilation = CSharpCompilation.Create(
                    "CodeGraphAssembly",
                    syntaxTrees,
                    references
                );

                // 5) Walk each tree with a single walker
                var walker = new CodeGraphWalker();
                foreach (var tree in syntaxTrees)
                {
                    try
                    {
                        var model = compilation.GetSemanticModel(tree);
                        walker.SemanticModel = model;
                        
                        // Set the current file path for this syntax tree
                        string filePath = tree.FilePath;
                        walker.SetCurrentFile(filePath);
                        
                        walker.Visit(tree.GetRoot());
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"Error analyzing syntax tree: {ex.Message}");
                        // Continue with other trees
                    }
                }

                var graph = walker.GetGraph();

                // 6) Output to docs/graph.json
                try
                {
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
                    
                    // Print some statistics
                    Console.WriteLine($"Analysis Statistics:");
                    Console.WriteLine($"  Namespaces: {graph.Nodes.Count(n => n.Group == "namespace")}");
                    Console.WriteLine($"  Classes: {graph.Nodes.Count(n => n.Group == "class")}");
                    Console.WriteLine($"  Methods: {graph.Nodes.Count(n => n.Group == "method")}");
                    Console.WriteLine($"  Properties: {graph.Nodes.Count(n => n.Group == "property")}");
                    Console.WriteLine($"  Total nodes: {graph.Nodes.Count}");
                    Console.WriteLine($"  Total links: {graph.Links.Count}");
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"Error writing output file: {ex.Message}");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Unhandled exception: {ex.Message}");
                Console.WriteLine(ex.StackTrace);
            }
        }

        /// <summary>
        /// Gets a comprehensive set of metadata references for analysis
        /// </summary>
        private static List<MetadataReference> GetMetadataReferences()
        {
            var references = new List<MetadataReference>();
            
            // Essential references
            references.Add(MetadataReference.CreateFromFile(typeof(object).Assembly.Location)); // System.Private.CoreLib
            
            // Find and add more framework assemblies
            var assemblyPath = Path.GetDirectoryName(typeof(object).Assembly.Location);
            Console.WriteLine($"Looking for framework assemblies in: {assemblyPath}");
            
            // Common .NET assemblies that should be referenced
            var commonAssemblies = new[]
            {
                "System.Runtime.dll",
                "System.Collections.dll",
                "System.Linq.dll",
                "System.Linq.Expressions.dll",
                "System.IO.dll",
                "System.Net.Http.dll",
                "System.Threading.dll",
                "System.Text.RegularExpressions.dll",
                "System.ComponentModel.dll",
                "System.Xml.dll",
                "netstandard.dll",
                "System.Core.dll"
            };
            
            foreach (var assembly in commonAssemblies)
            {
                var fullPath = Path.Combine(assemblyPath, assembly);
                if (File.Exists(fullPath))
                {
                    try
                    {
                        references.Add(MetadataReference.CreateFromFile(fullPath));
                        Console.WriteLine($"Added reference: {assembly}");
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"Failed to add reference {assembly}: {ex.Message}");
                    }
                }
            }
            
            // Also try to load assemblies from the current application
            try
            {
                var entryAssembly = Assembly.GetEntryAssembly();
                var referencedAssemblies = entryAssembly.GetReferencedAssemblies();
                
                foreach (var refAssemblyName in referencedAssemblies)
                {
                    try
                    {
                        var refAssembly = Assembly.Load(refAssemblyName);
                        references.Add(MetadataReference.CreateFromFile(refAssembly.Location));
                        Console.WriteLine($"Added reference: {refAssemblyName.Name}");
                    }
                    catch (Exception)
                    {
                        // Skip if we can't load it
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error getting referenced assemblies: {ex.Message}");
            }
            
            Console.WriteLine($"Total references added: {references.Count}");
            return references;
        }
    }

    public class LowercaseNamingStrategy : NamingStrategy
    {
        protected override string ResolvePropertyName(string name)
        {
            return name.ToLowerInvariant();
        }
    }
}
