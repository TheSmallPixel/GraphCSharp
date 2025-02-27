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
        private SemanticModel _semanticModel;

        public SemanticModel SemanticModel
        {
            get => _semanticModel;
            set => _semanticModel = value;
        }

        // Collections to store discovered entities
        private HashSet<string> _namespaceNames = new HashSet<string>();
        private HashSet<string> _classNames = new HashSet<string>();
        private HashSet<string> _methodFullNames = new HashSet<string>();
        private HashSet<string> _propertyFullNames = new HashSet<string>();
        private HashSet<string> _variableFullNames = new HashSet<string>();
    
        // Maps a "caller" method to the list of "callee" methods it invokes
        private Dictionary<string, List<string>> _methodCallMap = new Dictionary<string, List<string>>();
        private Dictionary<string, List<string>> _methodPropertyMap = new Dictionary<string, List<string>>();
        private Dictionary<string, string> _variableTypeMap = new Dictionary<string, string>();
        private Dictionary<string, string> _propertyTypeMap = new Dictionary<string, string>();


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
        public override void VisitPropertyDeclaration(PropertyDeclarationSyntax node)
        {
            if (SemanticModel == null)
            {
                base.VisitPropertyDeclaration(node);
                return;
            }

            // e.g. public int MyProperty { get; set; }
            // Build a "fully qualified" property name: "Namespace.Class.Property"
            var propertyName = node.Identifier.Text;
            var fullPropertyName = string.IsNullOrEmpty(_currentClass)
                ? propertyName
                : $"{_currentClass}.{propertyName}";

            // Record property in our set
            _propertyFullNames.Add(fullPropertyName);

            // Use semantic model to get the property type
            var typeSymbol = SemanticModel.GetTypeInfo(node.Type).Type;
            if (typeSymbol != null)
            {
                string typeFullName = BuildFullTypeName(typeSymbol);

                // Record property->type
                if (!_propertyTypeMap.ContainsKey(fullPropertyName))
                {
                    _propertyTypeMap[fullPropertyName] = typeFullName;
                }
            }
            base.VisitPropertyDeclaration(node);
        }
        // 1) Local variables
        public override void VisitLocalDeclarationStatement(LocalDeclarationStatementSyntax node)
        {
            // e.g.  int x = 10, y = 20;
            // node.Declaration.Type => int
            // node.Declaration.Variables => x, y
            if (_semanticModel == null) {
                base.VisitLocalDeclarationStatement(node);
                return;
            }

            // The type info from the semantic model
            var typeSymbol = _semanticModel.GetTypeInfo(node.Declaration.Type).Type;
            if (typeSymbol != null) {
                string typeFullName = BuildFullTypeName(typeSymbol);
                
                foreach (var v in node.Declaration.Variables)
                {
                    // Build a unique name for the variable. For example:
                    // "Namespace.Class.Method.variableName"
                    // If we are inside a method, we can do something like:
                    string varName = v.Identifier.Text;

                    // If we have a current method:
                    string fullVarName = string.IsNullOrEmpty(_currentMethod)
                        ? varName  // no method context
                        : $"{_currentMethod}.{varName}";

                    _variableFullNames.Add(fullVarName);
                    if (!_variableTypeMap.ContainsKey(fullVarName))
                    {
                        _variableTypeMap[fullVarName] = typeFullName;
                    }
                }
            }

            base.VisitLocalDeclarationStatement(node);
        }
        // 2) Fields
        public override void VisitFieldDeclaration(FieldDeclarationSyntax node)
        {
            // e.g. public int age, count;
            if (_semanticModel == null) {
                base.VisitFieldDeclaration(node);
                return;
            }

            var typeSymbol = _semanticModel.GetTypeInfo(node.Declaration.Type).Type;
            if (typeSymbol != null)
            {
                string typeFullName = BuildFullTypeName(typeSymbol);

                // Fields can declare multiple variables in one statement
                foreach (var v in node.Declaration.Variables)
                {
                    // If we are inside a class "MyApp.Core.Foo", the field is "MyApp.Core.Foo.fieldName"
                    string varName = v.Identifier.Text;
                    string fullVarName = string.IsNullOrEmpty(_currentClass)
                        ? varName 
                        : $"{_currentClass}.{varName}";

                    _variableFullNames.Add(fullVarName);
                    if (!_variableTypeMap.ContainsKey(fullVarName))
                    {
                        _variableTypeMap[fullVarName] = typeFullName;
                    }
                }
            }

            base.VisitFieldDeclaration(node);
        }
        // Helper to build a full name like "System.Int32" or "MyApp.Core.Bar"
        private string BuildFullTypeName(ITypeSymbol typeSymbol)
        {
            // For a simple approach, 
            // e.g. "System.Int32", or "MyApp.Core.Foo" for classes in your code
            return $"{typeSymbol.ContainingNamespace}.{typeSymbol.Name}";
        }
        public override void VisitMemberAccessExpression(MemberAccessExpressionSyntax node)
        {
            // This catches expressions like "foo.MyProperty", "this.MyProperty", "SomeStaticClass.Property"
            // We'll see if the symbol is a property:
            if (_semanticModel == null || _currentMethod == null)
            {
                base.VisitMemberAccessExpression(node);
                return;
            }

            var symbolInfo = _semanticModel.GetSymbolInfo(node);
            var propertySymbol = symbolInfo.Symbol as IPropertySymbol;
            if (propertySymbol != null)
            {
                // Build a fully qualified property name
                var propNamespace = propertySymbol.ContainingNamespace?.ToString();
                var propClass = propertySymbol.ContainingType?.Name;
                var propName = propertySymbol.Name;

                if (!string.IsNullOrEmpty(propNamespace)
                    && !string.IsNullOrEmpty(propClass)
                    && !string.IsNullOrEmpty(propName))
                {
                    var fullPropertyName = $"{propNamespace}.{propClass}.{propName}";
                    
                    // Make sure we track that property in _propertyFullNames
                    if (!_propertyFullNames.Contains(fullPropertyName))
                    {
                        _propertyFullNames.Add(fullPropertyName);
                    }

                    // Now record an edge from the "current method" to that property
                    if (!_methodPropertyMap.ContainsKey(_currentMethod))
                    {
                        _methodPropertyMap[_currentMethod] = new List<string>();
                    }
                    if (!_methodPropertyMap[_currentMethod].Contains(fullPropertyName))
                    {
                        _methodPropertyMap[_currentMethod].Add(fullPropertyName);
                    }
                }
            }

            base.VisitMemberAccessExpression(node);
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
            // 3) Add variable nodes
            foreach (var varName in _variableFullNames)
            {
                graph.Nodes.Add(new D3Node
                {
                    Id = varName,
                    Group = "variable",
                    Label = varName.Split('.').Last() // e.g. "x" or "age"
                });
            }
            // 4) Link variable -> type
            // We'll also create nodes for the type if we want them in the graph.
            // Or if "typeSymbol" references a class we already have, we can link to that class node.
            // If it's external (e.g. System.Int32), we might choose to create an "external type" node or skip.
            foreach (var kvp in _variableTypeMap)
            {
                var variableName = kvp.Key;     // e.g. "MyApp.Core.Foo.Bar.x"
                var typeFullName = kvp.Value;   // e.g. "System.Int32" or "MyApp.Core.Foo"

                // Add a node for the type if we want to show it
                // or if we already do class-based nodes, see if typeFullName is in _classNames or something
                // For demonstration, let's create a node for ANY type
                graph.Nodes.Add(new D3Node
                {
                    Id = typeFullName,
                    Group = "type",
                    Label = typeFullName.Split('.').Last()
                });

                // Create the link (variable -> type) with a special property "reference type"
                graph.Links.Add(new D3Link
                {
                    Source = variableName,
                    Target = typeFullName,
                    Type = "reference"  // or some property name indicating it's a variable->type link
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
            foreach (var prop in _propertyFullNames)
            {
                graph.Nodes.Add(new D3Node
                {
                    Id = prop,
                    Group = "property",
                    Label = prop.Split('.').Last()
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
                            Target = cls,
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
                            Target = method,
                            Type = "containment"
                        });
                    }
                }
            }
            // 4) class->property
            // we can do the same substring logic as method->class:
            foreach (var prop in _propertyFullNames)
            {
                int idx = prop.LastIndexOf('.');
                if (idx > 0)
                {
                    var cls = prop.Substring(0, idx);
                    // If that class is in _classNames, link them
                    if (_classNames.Contains(cls))
                    {
                        graph.Links.Add(new D3Link
                        {
                            Source = cls,
                            Target = prop,
                            Type = "containment"
                        });
                    }
                }
            }
            // 5) method->property usage
            foreach (var kvp in _methodPropertyMap)
            {
                var callerMethod = kvp.Key; // e.g. "MyApp.Core.Foo.Bar"
                foreach (var property in kvp.Value)
                {
                    graph.Links.Add(new D3Link
                    {
                        Source = callerMethod,
                        Target = property,
                        Type = "external"
                    });
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
