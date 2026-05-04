using System.IO;
using System.Linq;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Xunit;

namespace CodeAnalysisTool.Tests;

public class WalkerSmokeTests
{
    private static MetadataReference[] GetReferences()
    {
        var runtimeDir = Path.GetDirectoryName(typeof(object).Assembly.Location)!;
        return new MetadataReference[]
        {
            MetadataReference.CreateFromFile(typeof(object).Assembly.Location),
            MetadataReference.CreateFromFile(Path.Combine(runtimeDir, "System.Runtime.dll")),
            MetadataReference.CreateFromFile(Path.Combine(runtimeDir, "System.Console.dll")),
        };
    }

    private static D3Graph WalkSource(string source, string fileName = "Test.cs")
    {
        var tree = CSharpSyntaxTree.ParseText(source);
        var compilation = CSharpCompilation.Create(
            "TestAssembly",
            new[] { tree },
            GetReferences());

        var walker = new CodeGraphWalker
        {
            SemanticModel = compilation.GetSemanticModel(tree)
        };
        walker.SetCurrentFile(fileName);
        walker.Visit(tree.GetRoot());
        return walker.GetGraph();
    }

    [Fact]
    public void Emits_namespace_class_and_method_nodes()
    {
        var graph = WalkSource(@"
namespace Demo
{
    public class Greeter
    {
        public string Hello(string name) => $""hi {name}"";
    }
}");

        Assert.Contains(graph.Nodes, n => n.Group == "namespace" && n.Id == "Demo");
        Assert.Contains(graph.Nodes, n => n.Group == "class" && n.Id == "Demo.Greeter");
        Assert.Contains(graph.Nodes, n => n.Group == "method" && n.Id == "Demo.Greeter.Hello");
    }

    [Fact]
    public void Emits_containment_links_for_class_hierarchy()
    {
        var graph = WalkSource(@"
namespace MyApp
{
    public class Service
    {
        public void Run() { }
    }
}");

        Assert.Contains(graph.Links, l => l.Source == "MyApp" && l.Target == "MyApp.Service" && l.Type == "containment");
        Assert.Contains(graph.Links, l => l.Source == "MyApp.Service" && l.Target == "MyApp.Service.Run" && l.Type == "containment");
    }

    [Fact]
    public void Detects_properties()
    {
        var graph = WalkSource(@"
namespace Models
{
    public class User
    {
        public string Name { get; set; }
        public int Age { get; set; }
    }
}");

        Assert.Contains(graph.Nodes, n => n.Group == "property" && n.Id == "Models.User.Name");
        Assert.Contains(graph.Nodes, n => n.Group == "property" && n.Id == "Models.User.Age");
    }

    [Fact]
    public void Tracks_method_calls_as_call_links()
    {
        var graph = WalkSource(@"
namespace App
{
    public class Caller
    {
        public void Execute()
        {
            DoWork();
        }

        public void DoWork() { }
    }
}");

        Assert.Contains(graph.Links, l =>
            l.Source == "App.Caller.Execute" &&
            l.Target == "App.Caller.DoWork" &&
            l.Type == "call");
    }

    [Fact]
    public void Marks_called_methods_as_used()
    {
        // Helper declared before Entry so the walker has registered it
        // by the time the invocation is visited (depth-first source order).
        var graph = WalkSource(@"
namespace App
{
    public class Svc
    {
        public void Helper() { }
        public void Orphan() { }

        public void Entry()
        {
            Helper();
        }
    }
}");

        var helper = graph.Nodes.First(n => n.Id == "App.Svc.Helper");
        var orphan = graph.Nodes.First(n => n.Id == "App.Svc.Orphan");

        Assert.True(helper.Used);
        Assert.False(orphan.Used);
    }

    [Fact]
    public void Stores_file_path_and_line_number()
    {
        var graph = WalkSource(@"
namespace Loc
{
    public class Positioned
    {
        public void Method() { }
    }
}", "Located.cs");

        var cls = graph.Nodes.First(n => n.Id == "Loc.Positioned");
        Assert.Equal("Located.cs", cls.FilePath);
        Assert.True(cls.LineNumber > 0);
    }

    [Fact]
    public void External_method_calls_produce_external_link_type()
    {
        var graph = WalkSource(@"
using System;
namespace App
{
    public class Logger
    {
        public void Log(string msg)
        {
            Console.WriteLine(msg);
        }
    }
}");

        Assert.Contains(graph.Links, l =>
            l.Source == "App.Logger.Log" &&
            l.Type == "external");
    }
}
