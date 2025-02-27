using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Newtonsoft.Json; // if you want to serialize the final graph
using System.Collections.Generic;
using System.Linq;

namespace CodeAnalysisTool
{
    /// <summary>
    /// This syntax walker visits namespaces, classes, methods, and invocation expressions.
    /// It accumulates data into a D3Graph (with nodes and links).
    /// </summary>
    public class CodeGraphWalker : CSharpSyntaxWalker
    {
        // We'll set SemanticModel for each syntax tree we visit
        public SemanticModel SemanticModel { get; set; }

        // Collections to store discovered entities
        private HashSet<string> _namespaceNames = new HashSet<string>();
        private HashSet<string> _classNames = new HashSet<string>();
        private HashSet<string> _methodFullNames = new HashSet<string>();

        // Maps a "caller" method to the list of "callee" methods it invokes
        private Dictionary<string, List<string>> _methodCallMap = new Dictionary<string, List<string>>();

        // Track "where we are" during traversal
        private string _currentNamespace;
        private string _currentClass;
        private string _currentMethod;

        /// <summary>
        /// Override this if you want to see more detail about the visiting order.
        /// </summary>
        public override void Visit(SyntaxNode node)
        {
            // You could add custom logic here if needed
            base.Visit(node);
        }

        /// <summary>
        /// Visit a "namespace X.Y" declaration. 
        /// We record its name, set it as current, and recurse.
        /// </summary>
        public override void VisitNamespaceDeclaration(NamespaceDeclarationSyntax node)
        {
            _currentNamespace = node.Name.ToString();
            _namespaceNames.Add(_currentNamespace);

            base.VisitNamespaceDeclaration(node);

            // Once we finish, reset
            _currentNamespace = null;
        }

        /// <summary>
        /// Visit "class Foo" declarations. 
        /// We'll build a full name "Namespace.ClassName".
        /// </summary>
        public override void VisitClassDeclaration(ClassDeclarationSyntax node)
        {
            var className = node.Identifier.Text;
            var fullClassName = string.IsNullOrEmpty(_currentNamespace)
                ? className
                : $"{_currentNamespace}.{className}";

            _classNames.Add(fullClassName);

            var prevClass = _currentClass;
            _currentClass = fullClassName;

            base.VisitClassDeclaration(node);

            _currentClass = prevClass;
        }

        /// <summary>
        /// Visit "public void Bar()" method declarations. 
        /// We record "Namespace.Class.Method" as a full name.
        /// </summary>
        public override void VisitMethodDeclaration(MethodDeclarationSyntax node)
        {
            var methodName = node.Identifier.Text;
            var fullMethodName = string.IsNullOrEmpty(_currentClass)
                ? methodName
                : $"{_currentClass}.{methodName}";

            // Keep track of it
            _methodFullNames.Add(fullMethodName);

            // Ensure there's an entry for calls from this method
            if (!_methodCallMap.ContainsKey(fullMethodName))
            {
                _methodCallMap[fullMethodName] = new List<string>();
            }

            // Update the "current method" context
            var prevMethod = _currentMethod;
            _currentMethod = fullMethodName;

            base.VisitMethodDeclaration(node);

            // Restore
            _currentMethod = prevMethod;
        }

        /// <summary>
        /// Visit method invocations (e.g. foo.Bar() calls).
        /// We use the SemanticModel to find the invoked symbol,
        /// building a fully qualified name for the callee if possible.
        /// </summary>
        public override void VisitInvocationExpression(InvocationExpressionSyntax node)
        {
            if (SemanticModel == null || _currentMethod == null)
            {
                // If we don't have a semantic model or no current method context, skip
                base.VisitInvocationExpression(node);
                return;
            }

            // Get symbol info for the invocation
            var symbolInfo = SemanticModel.GetSymbolInfo(node);
            var methodSymbol = symbolInfo.Symbol as IMethodSymbol;

            if (methodSymbol != null)
            {
                var calleeNamespace = methodSymbol.ContainingNamespace?.ToString();
                var calleeClass = methodSymbol.ContainingType?.Name;
                var calleeMethod = methodSymbol.Name;

                if (!string.IsNullOrEmpty(calleeNamespace)
                    && !string.IsNullOrEmpty(calleeClass)
                    && !string.IsNullOrEmpty(calleeMethod))
                {
                    // Full name: "Namespace.Class.Method"
                    var calleeFullName = $"{calleeNamespace}.{calleeClass}.{calleeMethod}";

                    // Make sure we record the callee method as well
                    if (!_methodFullNames.Contains(calleeFullName))
                    {
                        _methodFullNames.Add(calleeFullName);
                        if (!_methodCallMap.ContainsKey(calleeFullName))
                            _methodCallMap[calleeFullName] = new List<string>();
                    }

                    // Add an edge from the current method to the callee
                    if (!_methodCallMap[_currentMethod].Contains(calleeFullName))
                    {
                        _methodCallMap[_currentMethod].Add(calleeFullName);
                    }
                }
            }

            base.VisitInvocationExpression(node);
        }

        /// <summary>
        /// Builds a D3Graph (Nodes + Links) that references 
        /// discovered namespaces, classes, methods, and method-call edges.
        /// </summary>
        public D3Graph GetGraph()
        {
            // Create the graph model
            var graph = new D3Graph();

            // 1) Namespace nodes
            foreach (var ns in _namespaceNames)
            {
                graph.Nodes.Add(new D3Node
                {
                    Id = ns,
                    Group = "namespace",
                    Label = ns
                });
            }

            // 2) Class nodes
            foreach (var cls in _classNames)
            {
                var classLabel = cls.Split('.').Last(); // e.g. "Foo"
                graph.Nodes.Add(new D3Node
                {
                    Id = cls,
                    Group = "class",
                    Label = classLabel
                });
            }

            // 3) Method nodes
            foreach (var method in _methodFullNames)
            {
                var methodLabel = method.Split('.').Last(); // e.g. "Bar"
                graph.Nodes.Add(new D3Node
                {
                    Id = method,
                    Group = "method",
                    Label = methodLabel
                });
            }

            // 4) Links:
            // (a) namespace -> class
            foreach (var cls in _classNames)
            {
                int idx = cls.LastIndexOf('.');
                if (idx > 0)
                {
                    var ns = cls.Substring(0, idx);
                    if (_namespaceNames.Contains(ns))
                    {
                        graph.Links.Add(new D3Link
                        {
                            Source = ns,
                            Target = cls
                            Type = "containment"
                        });
                    }
                }
            }

            // (b) class -> method
            foreach (var method in _methodFullNames)
            {
                int idx = method.LastIndexOf('.');
                if (idx > 0)
                {
                    var cls = method.Substring(0, idx);
                    if (_classNames.Contains(cls))
                    {
                        graph.Links.Add(new D3Link
                        {
                            Source = cls,
                            Target = method
                            Type = "containment"
                        });
                    }
                }
            }

            // (c) method -> method (method calls)
            foreach (var kvp in _methodCallMap)
            {
                var caller = kvp.Key;
                foreach (var callee in kvp.Value)
                {
                    // default to internal call
                    var linkType = "call";

                    // Maybe mark external if the callee belongs to a namespace outside your code.
                    // For example, if your code's root is "MyApp", anything that starts with "System."
                    // or doesn't match your known namespaces is external:
                    var calleeNs = callee.Split('.')[0]; 
                    // or do a more robust check

                    if (callee.StartsWith("System.") || !_namespaceNames.Any(ns => callee.StartsWith(ns)))
                    {
                        linkType = "external";
                    }

                    graph.Links.Add(new D3Link
                    {
                        Source = caller,
                        Target = callee,
                        Type = linkType
                    });
                }
            }

            return graph;
        }
    }

    /// <summary>
    /// Simple container for the final D3-based graph.
    /// </summary>
    public class D3Graph
    {
        public List<D3Node> Nodes { get; set; } = new List<D3Node>();
        public List<D3Link> Links { get; set; } = new List<D3Link>();
    }

    public class D3Node
    {
        public string Id { get; set; }
        public string Group { get; set; }
        public string Label { get; set; }
    }

    public class D3Link
    {
        public string Source { get; set; }
        public string Target { get; set; }
        public string Type { get; set; }
    }
}
