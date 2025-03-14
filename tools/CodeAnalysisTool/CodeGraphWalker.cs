using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Newtonsoft.Json; // if you want to serialize the final graph
using System;
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
        
        // Track used methods and properties for unused code detection
        private HashSet<string> _usedMethods = new HashSet<string>();
        private HashSet<string> _usedProperties = new HashSet<string>();
        private HashSet<string> _usedClasses = new HashSet<string>();

        // Track "where we are" during traversal
        private string _currentNamespace;
        private string _currentClass;
        private string _currentMethod;

        /// <summary>
        /// Override this if you want to see more detail about the visiting order.
        /// </summary>
        public override void Visit(SyntaxNode node)
        {
            try
            {
                base.Visit(node);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error during code traversal: {ex.Message}");
                // Continue despite errors
            }
        }

        /// <summary>
        /// Visit a "namespace X.Y" declaration. 
        /// We record its name, set it as current, and recurse.
        /// </summary>
        public override void VisitNamespaceDeclaration(NamespaceDeclarationSyntax node)
        {
            string namespaceName = node.Name.ToString();
            _currentNamespace = namespaceName;
            _namespaceNames.Add(namespaceName);

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

            // If this class has a base class, record that relationship
            if (node.BaseList != null)
            {
                foreach (var baseType in node.BaseList.Types)
                {
                    if (SemanticModel != null)
                    {
                        var typeInfo = SemanticModel.GetTypeInfo(baseType.Type);
                        if (typeInfo.Type != null)
                        {
                            var baseClassName = BuildFullTypeName(typeInfo.Type);
                            _usedClasses.Add(baseClassName);
                        }
                    }
                }
            }

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

            // Check if this method overrides another method
            bool isOverride = node.Modifiers.Any(m => m.ValueText == "override");
            if (isOverride)
            {
                // An override method is implicitly used
                _usedMethods.Add(fullMethodName);
            }

            // Special case for Main method - it's the entry point, so it's used
            if (methodName == "Main")
            {
                _usedMethods.Add(fullMethodName);
            }

            // Ensure there's an entry for calls from this method
            if (!_methodCallMap.ContainsKey(fullMethodName))
            {
                _methodCallMap[fullMethodName] = new List<string>();
            }

            // Ensure there's an entry for property usage from this method
            if (!_methodPropertyMap.ContainsKey(fullMethodName))
            {
                _methodPropertyMap[fullMethodName] = new List<string>();
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

            // Check if this property overrides another property
            bool isOverride = node.Modifiers.Any(m => m.ValueText == "override");
            if (isOverride)
            {
                // An override property is implicitly used
                _usedProperties.Add(fullPropertyName);
            }

            // Use semantic model to get the property type
            var typeSymbol = SemanticModel.GetTypeInfo(node.Type).Type;
            if (typeSymbol != null)
            {
                string typeFullName = BuildFullTypeName(typeSymbol);
                
                // Mark this type as used
                if (_classNames.Contains(typeFullName))
                {
                    _usedClasses.Add(typeFullName);
                }

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
            if (SemanticModel == null || string.IsNullOrEmpty(_currentMethod))
            {
                base.VisitLocalDeclarationStatement(node);
                return;
            }

            foreach (var variable in node.Declaration.Variables)
            {
                string variableName = variable.Identifier.Text;
                string fullVariableName = $"{_currentMethod}.{variableName}";
                _variableFullNames.Add(fullVariableName);

                // Get type information
                var typeSymbol = SemanticModel.GetTypeInfo(node.Declaration.Type).Type;
                if (typeSymbol != null)
                {
                    string typeFullName = BuildFullTypeName(typeSymbol);
                    
                    // Mark this type as used if it's one of our classes
                    if (_classNames.Contains(typeFullName))
                    {
                        _usedClasses.Add(typeFullName);
                    }
                    
                    _variableTypeMap[fullVariableName] = typeFullName;
                }
            }

            base.VisitLocalDeclarationStatement(node);
        }

        // 2) Field variables
        public override void VisitFieldDeclaration(FieldDeclarationSyntax node)
        {
            if (SemanticModel == null || string.IsNullOrEmpty(_currentClass))
            {
                base.VisitFieldDeclaration(node);
                return;
            }

            // Get the type of field
            var typeSymbol = SemanticModel.GetTypeInfo(node.Declaration.Type).Type;
            if (typeSymbol != null)
            {
                string typeFullName = BuildFullTypeName(typeSymbol);
                
                // Mark this type as used if it's one of our classes
                if (_classNames.Contains(typeFullName))
                {
                    _usedClasses.Add(typeFullName);
                }
                
                foreach (var variable in node.Declaration.Variables)
                {
                    string variableName = variable.Identifier.Text;
                    string fullVariableName = $"{_currentClass}.{variableName}";
                    _variableFullNames.Add(fullVariableName);
                    _variableTypeMap[fullVariableName] = typeFullName;
                }
            }

            base.VisitFieldDeclaration(node);
        }

        // 3) Method calls (e.g. foo.Bar())
        public override void VisitInvocationExpression(InvocationExpressionSyntax node)
        {
            // We can only analyze properly with semantic model
            if (SemanticModel == null || string.IsNullOrEmpty(_currentMethod))
            {
                base.VisitInvocationExpression(node);
                return;
            }

            // Get the referenced method
            var methodSymbol = SemanticModel.GetSymbolInfo(node).Symbol as IMethodSymbol;
            if (methodSymbol != null)
            {
                string calledMethod = BuildFullMethodName(methodSymbol);
                
                // Record this call
                _methodCallMap[_currentMethod].Add(calledMethod);
                
                // Mark the called method as used
                if (_methodFullNames.Contains(calledMethod))
                {
                    _usedMethods.Add(calledMethod);
                }
            }

            base.VisitInvocationExpression(node);
        }

        // 4) Property access (e.g. foo.Bar)
        public override void VisitMemberAccessExpression(MemberAccessExpressionSyntax node)
        {
            if (SemanticModel == null || string.IsNullOrEmpty(_currentMethod))
            {
                base.VisitMemberAccessExpression(node);
                return;
            }

            // Get the referenced property
            var symbol = SemanticModel.GetSymbolInfo(node).Symbol;
            if (symbol is IPropertySymbol propertySymbol)
            {
                string propertyName = BuildFullPropertyName(propertySymbol);
                
                // Record that this method accesses the property
                if (!_methodPropertyMap.ContainsKey(_currentMethod))
                {
                    _methodPropertyMap[_currentMethod] = new List<string>();
                }
                
                if (!_methodPropertyMap[_currentMethod].Contains(propertyName))
                {
                    _methodPropertyMap[_currentMethod].Add(propertyName);
                }
                
                // Mark the property as used
                if (_propertyFullNames.Contains(propertyName))
                {
                    _usedProperties.Add(propertyName);
                }
            }

            base.VisitMemberAccessExpression(node);
        }

        // Helpers for building full names from symbols
        private string BuildFullTypeName(ITypeSymbol typeSymbol)
        {
            if (typeSymbol == null)
                return "Unknown";

            if (typeSymbol.ContainingNamespace != null && !string.IsNullOrEmpty(typeSymbol.ContainingNamespace.Name))
            {
                return $"{typeSymbol.ContainingNamespace}.{typeSymbol.Name}";
            }

            return typeSymbol.Name;
        }

        private string BuildFullMethodName(IMethodSymbol methodSymbol)
        {
            if (methodSymbol == null)
                return "Unknown";

            if (methodSymbol.ContainingType != null)
            {
                string typeName = BuildFullTypeName(methodSymbol.ContainingType);
                return $"{typeName}.{methodSymbol.Name}";
            }

            return methodSymbol.Name;
        }

        private string BuildFullPropertyName(IPropertySymbol propertySymbol)
        {
            if (propertySymbol == null)
                return "Unknown";

            if (propertySymbol.ContainingType != null)
            {
                string typeName = BuildFullTypeName(propertySymbol.ContainingType);
                return $"{typeName}.{propertySymbol.Name}";
            }

            return propertySymbol.Name;
        }

        /// <summary>
        /// Generates the final D3 graph with all nodes and links
        /// </summary>
        public D3Graph GetGraph()
        {
            // Create a D3 force graph
            var graph = new D3Graph();
            
            // Track external nodes we need to create
            var externalNodes = new HashSet<string>();
            
            // First pass: collect all external references that need nodes
            foreach (var kvp in _methodCallMap)
            {
                foreach (var callee in kvp.Value)
                {
                    if (!_methodFullNames.Contains(callee))
                    {
                        externalNodes.Add(callee);
                    }
                }
            }
            
            foreach (var kvp in _methodPropertyMap)
            {
                foreach (var property in kvp.Value)
                {
                    if (!_propertyFullNames.Contains(property))
                    {
                        externalNodes.Add(property);
                    }
                }
            }

            // 1) Add namespace nodes
            foreach (var ns in _namespaceNames)
            {
                graph.Nodes.Add(new D3Node
                {
                    Id = ns,
                    Group = "namespace",
                    Label = ns,
                    Used = true // Namespaces are always considered "used"
                });
            }

            // 2) Add class nodes
            foreach (var cls in _classNames)
            {
                graph.Nodes.Add(new D3Node
                {
                    Id = cls,
                    Group = "class",
                    Label = cls.Split('.').Last(),
                    Used = _usedClasses.Contains(cls)
                });
            }

            // 3) Add method nodes
            foreach (var method in _methodFullNames)
            {
                graph.Nodes.Add(new D3Node
                {
                    Id = method,
                    Group = "method",
                    Label = method.Split('.').Last(),
                    Used = _usedMethods.Contains(method)
                });
            }
            
            // Add property nodes
            foreach (var prop in _propertyFullNames)
            {
                graph.Nodes.Add(new D3Node
                {
                    Id = prop,
                    Group = "property",
                    Label = prop.Split('.').Last(),
                    Used = _usedProperties.Contains(prop)
                });
            }
            
            // Add external nodes for references that would be dangling otherwise
            foreach (var externalNode in externalNodes)
            {
                string group = "external";
                if (externalNode.EndsWith("()"))
                {
                    group = "external-method";
                }
                else
                {
                    // Check if it looks like a property
                    var lastPart = externalNode.Split('.').Last();
                    if (char.IsUpper(lastPart[0]))
                    {
                        group = "external-property";
                    }
                }
                
                graph.Nodes.Add(new D3Node
                {
                    Id = externalNode,
                    Group = group,
                    Label = externalNode.Split('.').Last(),
                    Used = true // External nodes are always "used" since they're referenced
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
            
            // (c) class->property
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
            
            // (d) method->property usage
            foreach (var kvp in _methodPropertyMap)
            {
                var callerMethod = kvp.Key; // e.g. "MyApp.Core.Foo.Bar"
                foreach (var property in kvp.Value)
                {
                    // Make sure both ends of the link exist
                    if (NodeExists(graph, callerMethod) && NodeExists(graph, property))
                    {
                        // Check if this is a valid property in our codebase
                        bool isExternal = !_propertyFullNames.Contains(property);
                        
                        graph.Links.Add(new D3Link
                        {
                            Source = callerMethod,
                            Target = property,
                            Type = isExternal ? "external" : "reference"
                        });
                    }
                }
            }

            // (e) method -> method (method calls)
            foreach (var kvp in _methodCallMap)
            {
                var caller = kvp.Key;
                foreach (var callee in kvp.Value)
                {
                    // Make sure both ends of the link exist
                    if (NodeExists(graph, caller) && NodeExists(graph, callee))
                    {
                        // default to internal call
                        var linkType = "call";

                        // Check if this is an external call (a method outside our codebase)
                        bool isExternal = !_methodFullNames.Contains(callee);
                        if (isExternal)
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
            }

            return graph;
        }
        
        /// <summary>
        /// Checks if a node with the given ID exists in the graph
        /// </summary>
        private bool NodeExists(D3Graph graph, string nodeId)
        {
            return graph.Nodes.Any(n => n.Id == nodeId);
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
        public bool Used { get; set; } = false;
    }

    public class D3Link
    {
        public string Source { get; set; }
        public string Target { get; set; }
        public string Type { get; set; }
    }
}
