using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Xunit;

namespace CodeAnalysisTool.Tests;

public class WalkerSmokeTests
{
    [Fact]
    public void Walker_emits_namespace_class_and_method_nodes_for_trivial_source()
    {
        const string source = @"
namespace Demo
{
    public class Greeter
    {
        public string Hello(string name) => $""hi {name}"";
    }
}";

        var tree = CSharpSyntaxTree.ParseText(source);
        var compilation = CSharpCompilation.Create(
            "Smoke",
            new[] { tree },
            new[] { MetadataReference.CreateFromFile(typeof(object).Assembly.Location) });

        var walker = new CodeGraphWalker
        {
            SemanticModel = compilation.GetSemanticModel(tree)
        };
        walker.SetCurrentFile("Greeter.cs");
        walker.Visit(tree.GetRoot());

        var graph = walker.GetGraph();

        Assert.NotEmpty(graph.Nodes);
        Assert.Contains(graph.Nodes, n => n.Group == "namespace");
        Assert.Contains(graph.Nodes, n => n.Group == "class");
        Assert.Contains(graph.Nodes, n => n.Group == "method");
    }

    [Fact]
    public void Walker_emits_links_between_namespace_and_class()
    {
        const string source = @"
namespace MyApp
{
    public class Service
    {
        public void Run() { }
    }
}";

        var tree = CSharpSyntaxTree.ParseText(source);
        var compilation = CSharpCompilation.Create(
            "Links",
            new[] { tree },
            new[] { MetadataReference.CreateFromFile(typeof(object).Assembly.Location) });

        var walker = new CodeGraphWalker
        {
            SemanticModel = compilation.GetSemanticModel(tree)
        };
        walker.SetCurrentFile("Service.cs");
        walker.Visit(tree.GetRoot());

        var graph = walker.GetGraph();

        Assert.NotEmpty(graph.Links);
    }
}
