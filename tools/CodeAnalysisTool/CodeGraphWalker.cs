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
        // Track the semantic model for symbol resolution
        public SemanticModel SemanticModel { get; set; }

        // Current context
        private string _currentNamespace;
        private string _currentClass;
        private string _currentMethod;

        // Track nodes for the graph
        private readonly HashSet<string> _namespaceNames = new HashSet<string>();
        private readonly HashSet<string> _classNames = new HashSet<string>();
        private readonly HashSet<string> _methodFullNames = new HashSet<string>();
        private readonly HashSet<string> _propertyFullNames = new HashSet<string>();
        private readonly HashSet<string> _variableFullNames = new HashSet<string>();

        // Track used/unused elements
        private readonly HashSet<string> _usedClasses = new HashSet<string>();
        private readonly HashSet<string> _usedMethods = new HashSet<string>();
        private readonly HashSet<string> _usedProperties = new HashSet<string>();
        private readonly HashSet<string> _usedVariables = new HashSet<string>();

        // Track method calls and property access
        private readonly Dictionary<string, List<string>> _methodCallMap = new Dictionary<string, List<string>>();
        private readonly Dictionary<string, List<string>> _methodPropertyMap = new Dictionary<string, List<string>>();
        private readonly Dictionary<string, string> _variableTypeMap = new Dictionary<string, string>();

        // Dictionary to store code locations
        private readonly Dictionary<string, (string FilePath, int LineNumber)> _nodeLocations = 
            new Dictionary<string, (string FilePath, int LineNumber)>();
            
        // Current file being processed
        private string _currentFilePath = "";

        // Override to use custom parameters
        public CodeGraphWalker() : base(SyntaxWalkerDepth.Node)
        {
        }

        /// <summary>
        /// Set the current file path before processing
        /// </summary>
        public void SetCurrentFile(string filePath)
        {
            _currentFilePath = filePath;
        }

        /// <summary>
        /// Get location information for a syntax node
        /// </summary>
        private (string FilePath, int LineNumber) GetNodeLocation(SyntaxNode node)
        {
            if (node == null) return (_currentFilePath, 0);
            
            var location = node.GetLocation();
            if (location == null) return (_currentFilePath, 0);
            
            var lineSpan = location.GetLineSpan();
            return (_currentFilePath, lineSpan.StartLinePosition.Line + 1); // +1 because lines are 0-indexed
        }

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
            // Build fully qualified class name
            if (!string.IsNullOrEmpty(_currentNamespace))
            {
                _currentClass = $"{_currentNamespace}.{node.Identifier.Text}";
            }
            else
            {
                _currentClass = node.Identifier.Text;
            }
            
            // Add to the class names we're tracking
            _classNames.Add(_currentClass);
            
            // Store location information
            _nodeLocations[_currentClass] = GetNodeLocation(node);
            
            // Check if this is a likely entry point class (Program, Startup, etc.)
            bool isEntryPoint = IsLikelyEntryPointClass(node);
            if (isEntryPoint)
            {
                // Mark entry point classes as used
                _usedClasses.Add(_currentClass);
            }
            
            // Process base classes/interfaces
            // Note: Base types include both base classes and interfaces
            if (node.BaseList != null)
            {
                foreach (var baseType in node.BaseList.Types)
                {
                    var baseTypeName = baseType.Type.ToString();
                    
                    // Mark base classes as used automatically 
                    if (_classNames.Contains(baseTypeName))
                    {
                        _usedClasses.Add(baseTypeName);
                    }
                }
            }
            
            base.VisitClassDeclaration(node);
            
            _currentClass = null;
        }

        /// <summary>
        /// Determines if a class is likely to be an entry point based on name and structure
        /// </summary>
        private bool IsLikelyEntryPointClass(ClassDeclarationSyntax node)
        {
            // Check class name patterns that are common for entry points
            string className = node.Identifier.Text;
            if (className == "Program" || className == "Startup" || 
                className == "Application" || className.EndsWith("Application") ||
                className.EndsWith("App") || className == "Main")
            {
                // Further verify by looking for Main method or Program.cs file
                foreach (var member in node.Members)
                {
                    if (member is MethodDeclarationSyntax method)
                    {
                        string methodName = method.Identifier.Text;
                        
                        // Common entry point method names
                        if (methodName == "Main" || methodName == "Run" || 
                            methodName == "Start" || methodName == "Initialize")
                        {
                            return true;
                        }
                    }
                }
                
                // Check if this is in a file that sounds like an entry point
                if (_currentFilePath.EndsWith("Program.cs") || 
                    _currentFilePath.EndsWith("Application.cs") ||
                    _currentFilePath.EndsWith("Startup.cs") ||
                    _currentFilePath.EndsWith("Main.cs"))
                {
                    return true;
                }
            }
            
            return false;
        }

        /// <summary>
        /// Visit "public void Bar()" method declarations. 
        /// We record "Namespace.Class.Method" as a full name.
        /// </summary>
        public override void VisitMethodDeclaration(MethodDeclarationSyntax node)
        {
            if (!string.IsNullOrEmpty(_currentClass))
            {
                _currentMethod = $"{_currentClass}.{node.Identifier.Text}";
                _methodFullNames.Add(_currentMethod);
                
                // Store location information
                _nodeLocations[_currentMethod] = GetNodeLocation(node);
                
                // Check if this is an entry point method like Main or a controller action
                bool isEntryPointMethod = IsLikelyEntryPointMethod(node);
                if (isEntryPointMethod)
                {
                    // Mark entry point methods as used
                    _usedMethods.Add(_currentMethod);
                }
                
                base.VisitMethodDeclaration(node);
                
                _currentMethod = null;
            }
            else
            {
                // Orphaned method (not in a class)
                base.VisitMethodDeclaration(node);
            }
        }
        
        /// <summary>
        /// Determines if a method is likely to be an entry point or important method
        /// </summary>
        private bool IsLikelyEntryPointMethod(MethodDeclarationSyntax node)
        {
            string methodName = node.Identifier.Text;
            
            // Check for common entry point method names
            if (methodName == "Main" || methodName == "Run" || 
                methodName == "Start" || methodName == "Initialize")
            {
                return true;
            }
            
            // Check for ASP.NET controller action methods (public and with attributes)
            if (node.Modifiers.Any(m => m.ValueText == "public") && 
                node.AttributeLists.Count > 0)
            {
                foreach (var attrList in node.AttributeLists)
                {
                    foreach (var attr in attrList.Attributes)
                    {
                        string attrName = attr.Name.ToString();
                        if (attrName.EndsWith("Action") || attrName.EndsWith("Filter") ||
                            attrName.Contains("Http") || attrName.EndsWith("Route"))
                        {
                            // This is likely a controller action method
                            return true;
                        }
                    }
                }
            }
            
            return false;
        }

        public override void VisitPropertyDeclaration(PropertyDeclarationSyntax node)
        {
            if (!string.IsNullOrEmpty(_currentClass))
            {
                string propertyName = node.Identifier.Text;
                string fullPropertyName = $"{_currentClass}.{propertyName}";
                _propertyFullNames.Add(fullPropertyName);
                
                // Store location information
                _nodeLocations[fullPropertyName] = GetNodeLocation(node);
                
                // Get type information
                var typeSymbol = SemanticModel.GetTypeInfo(node.Type).Type;
                if (typeSymbol != null)
                {
                    string typeFullName = BuildFullTypeName(typeSymbol);
                    
                    // If it's a type in our codebase, mark it as used
                    if (_classNames.Contains(typeFullName))
                    {
                        _usedClasses.Add(typeFullName);
                    }

                    // Record property->type
                    if (!_variableTypeMap.ContainsKey(fullPropertyName))
                    {
                        _variableTypeMap[fullPropertyName] = typeFullName;
                    }
                }
            }
            
            base.VisitPropertyDeclaration(node);
        }

        // 1) Local variables
        public override void VisitLocalDeclarationStatement(LocalDeclarationStatementSyntax node)
        {
            // Skip if we're not in a method context
            if (string.IsNullOrEmpty(_currentMethod))
            {
                base.VisitLocalDeclarationStatement(node);
                return;
            }
            
            // Process each variable in the declaration
            foreach (var variable in node.Declaration.Variables)
            {
                string variableName = variable.Identifier.Text;
                string fullVariableName = $"{_currentMethod}.{variableName}";
                _variableFullNames.Add(fullVariableName);
                
                // Store location information
                _nodeLocations[fullVariableName] = GetNodeLocation(node);

                // Get type information
                var typeSymbol = SemanticModel.GetTypeInfo(node.Declaration.Type).Type;
                if (typeSymbol != null)
                {
                    string typeFullName = BuildFullTypeName(typeSymbol);
                    
                    // If it's a type in our codebase, mark it as used
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
            if (!string.IsNullOrEmpty(_currentClass))
            {
                // Get the field type information
                var typeSymbol = SemanticModel.GetTypeInfo(node.Declaration.Type).Type;
                string typeFullName = null;
                
                if (typeSymbol != null)
                {
                    typeFullName = BuildFullTypeName(typeSymbol);
                    
                    // Track the class of the field type as "used"
                    if (_classNames.Contains(typeFullName))
                    {
                        _usedClasses.Add(typeFullName);
                    }
                }
                
                // Process each field in the declaration
                foreach (var variable in node.Declaration.Variables)
                {
                    string variableName = variable.Identifier.Text;
                    string fullVariableName = $"{_currentClass}.{variableName}";
                    _variableFullNames.Add(fullVariableName);
                    _variableTypeMap[fullVariableName] = typeFullName;
                    
                    // Store location information
                    _nodeLocations[fullVariableName] = GetNodeLocation(node);
                }
            }
            
            base.VisitFieldDeclaration(node);
        }

        // 3) Method calls (e.g. foo.Bar())
        public override void VisitInvocationExpression(InvocationExpressionSyntax node)
        {
            // Only track if we have semantic model
            if (SemanticModel != null)
            {
                var methodSymbol = SemanticModel.GetSymbolInfo(node).Symbol as IMethodSymbol;
                if (methodSymbol != null)
                {
                    // Get caller and callee names
                    var callerName = _currentMethod;
                    var calleeName = BuildFullMethodName(methodSymbol);

                    // Track the method call if we have a valid caller
                    if (!string.IsNullOrEmpty(callerName))
                    {
                        // Add to our call map
                        if (!_methodCallMap.ContainsKey(callerName))
                        {
                            _methodCallMap[callerName] = new List<string>();
                        }
                        _methodCallMap[callerName].Add(calleeName);
                        
                        // Mark the method as used when it's called
                        if (_methodFullNames.Contains(calleeName))
                        {
                            _usedMethods.Add(calleeName);
                        }
                    }
                    
                    // Track internal usage of utility methods
                    if (!string.IsNullOrEmpty(callerName) && callerName.StartsWith("CodeAnalysisTool.CodeGraphWalker") && calleeName.StartsWith("CodeAnalysisTool.CodeGraphWalker"))
                    {
                        // Mark called method as used
                        if (_methodFullNames.Contains(calleeName))
                        {
                            _usedMethods.Add(calleeName);
                        }
                    }
                    
                    // Check if this is a direct method invocation within CodeGraphWalker
                    if (node.Expression is IdentifierNameSyntax identifierName)
                    {
                        string methodName = identifierName.Identifier.Text;
                        
                        // If we're in CodeGraphWalker class and this is calling one of our utility methods
                        if (_currentClass == "CodeAnalysisTool.CodeGraphWalker")
                        {
                            string fullMethodName = $"{_currentClass}.{methodName}";
                            if (_methodFullNames.Contains(fullMethodName))
                            {
                                _usedMethods.Add(fullMethodName);
                            }
                        }
                    }
                }
            }

            base.VisitInvocationExpression(node);
        }

        // 4) Property access (e.g. foo.Bar)
        public override void VisitMemberAccessExpression(MemberAccessExpressionSyntax node)
        {
            // Skip if we don't have a semantic model or current method context
            if (SemanticModel != null && !string.IsNullOrEmpty(_currentMethod))
            {
                var symbolInfo = SemanticModel.GetSymbolInfo(node);
                if (symbolInfo.Symbol is IPropertySymbol propertySymbol)
                {
                    // Build the full property name
                    string propertyName = BuildFullPropertyName(propertySymbol);
                    
                    // Track this property access
                    if (!_methodPropertyMap.ContainsKey(_currentMethod))
                    {
                        _methodPropertyMap[_currentMethod] = new List<string>();
                    }
                    _methodPropertyMap[_currentMethod].Add(propertyName);
                    
                    // Mark the property as used if it's in our codebase
                    if (_propertyFullNames.Contains(propertyName))
                    {
                        _usedProperties.Add(propertyName);
                        
                        // Also mark the containing class as used
                        int idx = propertyName.LastIndexOf('.');
                        if (idx > 0)
                        {
                            var className = propertyName.Substring(0, idx);
                            if (_classNames.Contains(className))
                            {
                                _usedClasses.Add(className);
                            }
                        }
                    }
                }
                
                // Special case for node.Identifier.Text and similar token access patterns
                // These are common in our codebase but don't appear as property symbols
                if (node.Expression is IdentifierNameSyntax identifier && 
                    node.Name.Identifier.Text == "Identifier")
                {
                    // This is likely accessing SyntaxToken.Text or similar
                    string potentialProperty = $"{identifier.Identifier.Text}.Identifier";
                    if (!_methodPropertyMap.ContainsKey(_currentMethod))
                    {
                        _methodPropertyMap[_currentMethod] = new List<string>();
                    }
                    _methodPropertyMap[_currentMethod].Add(potentialProperty);
                }
            }
            
            base.VisitMemberAccessExpression(node);
        }

        /// <summary>
        /// Visit identifier name expressions (e.g. variable references)
        /// </summary>
        public override void VisitIdentifierName(IdentifierNameSyntax node)
        {
            // Only track identifiers within a method context
            if (SemanticModel != null && !string.IsNullOrEmpty(_currentMethod))
            {
                string identifierName = node.Identifier.Text;
                string fullVariableName = $"{_currentMethod}.{identifierName}";
                
                // If this is a variable we're tracking, mark it as used
                if (_variableFullNames.Contains(fullVariableName))
                {
                    _usedVariables.Add(fullVariableName);
                }
                
                // Also check if it might be a class field
                if (!string.IsNullOrEmpty(_currentClass))
                {
                    string fieldName = $"{_currentClass}.{identifierName}";
                    if (_variableFullNames.Contains(fieldName))
                    {
                        _usedVariables.Add(fieldName);
                    }
                }
            }
            
            base.VisitIdentifierName(node);
        }

        /// <summary>
        /// Improves property access tracking by processing object initializers
        /// </summary>
        public override void VisitInitializerExpression(InitializerExpressionSyntax node)
        {
            if (node.Parent is ObjectCreationExpressionSyntax objCreation && SemanticModel != null)
            {
                var typeInfo = SemanticModel.GetTypeInfo(objCreation.Type);
                if (typeInfo.Type != null)
                {
                    string className = BuildFullTypeName(typeInfo.Type);
                    
                    // Process each expression in the initializer (typically property assignments)
                    foreach (var expr in node.Expressions)
                    {
                        if (expr is AssignmentExpressionSyntax assignment && 
                            assignment.Left is IdentifierNameSyntax identifier)
                        {
                            string propertyName = identifier.Identifier.Text;
                            string fullPropertyName = $"{className}.{propertyName}";
                            
                            // If this property exists in our known properties, mark it used
                            if (_propertyFullNames.Contains(fullPropertyName))
                            {
                                _usedProperties.Add(fullPropertyName);
                            }
                            
                            // Add to method property map (for tracking where properties are used)
                            if (!string.IsNullOrEmpty(_currentMethod))
                            {
                                if (!_methodPropertyMap.ContainsKey(_currentMethod))
                                {
                                    _methodPropertyMap[_currentMethod] = new List<string>();
                                }
                                _methodPropertyMap[_currentMethod].Add(fullPropertyName);
                            }
                        }
                    }
                }
            }
            
            base.VisitInitializerExpression(node);
        }

        /// <summary>
        /// Visit object creation like "new Foo()".
        /// This helps us track class instantiation to determine used classes.
        /// </summary>
        public override void VisitObjectCreationExpression(ObjectCreationExpressionSyntax node)
        {
            if (SemanticModel != null)
            {
                var typeInfo = SemanticModel.GetTypeInfo(node.Type);
                if (typeInfo.Type != null)
                {
                    string fullTypeName = BuildFullTypeName(typeInfo.Type);
                    
                    // If this is creating an instance of a class we know, mark it as used
                    if (_classNames.Contains(fullTypeName))
                    {
                        _usedClasses.Add(fullTypeName);
                    }
                }
            }
            
            base.VisitObjectCreationExpression(node);
        }

        /// <summary>
        /// Determine if a node is from an external library
        /// </summary>
        private bool IsExternalLibrary(string fullName)
        {
            // Check if this is a known external namespace
            string[] externalPrefixes = new string[]
            {
                "System.",
                "Microsoft.",
                "Newtonsoft.",
                "NuGet.",
                "AutoMapper.",
                "EntityFramework",
                "Serilog.",
                "AWS.",
                "Amazon.",
                "Google.",
                "Azure."
                // Add more common libraries as needed
            };
            
            return externalPrefixes.Any(prefix => fullName.StartsWith(prefix));
        }

        /// <summary>
        /// Generates the final D3 graph with all nodes and links
        /// </summary>
        public D3Graph GetGraph()
        {
            // Create a graph with all our collected information
            D3Graph graph = new D3Graph
            {
                Nodes = new List<D3Node>(),
                Links = new List<D3Link>()
            };
            
            // Build namespace nodes
            foreach (var ns in _namespaceNames.Distinct())
            {
                var used = _usedNamespaces.Contains(ns);
                
                // If the namespace matches some known patterns, mark it as external
                bool isExternal = IsExternalLibrary(ns);
                
                graph.Nodes.Add(new D3Node
                {
                    Id = ns,
                    Group = "namespace",
                    Label = ns.Split('.').Last(),
                    Used = used,
                    IsExternal = isExternal,
                    // Location info for namespaces isn't tracked currently
                });
            }
            
            // Add class nodes
            foreach (var cls in _classNames.Distinct())
            {
                bool isExternal = IsExternalLibrary(cls);
                
                graph.Nodes.Add(new D3Node
                {
                    Id = cls,
                    Group = "class",
                    Label = cls.Split('.').Last(),
                    Used = _usedClasses.Contains(cls),
                    IsExternal = isExternal,
                    FilePath = GetFilePath(cls),
                    LineNumber = GetLineNumber(cls)
                });
            }
            
            // Add method nodes
            foreach (var method in _methodFullNames.Distinct())
            {
                bool isExternal = IsExternalLibrary(method);
                
                graph.Nodes.Add(new D3Node
                {
                    Id = method,
                    Group = "method",
                    Label = method.Split('.').Last(),
                    Used = _usedMethods.Contains(method),
                    IsExternal = isExternal,
                    FilePath = GetFilePath(method),
                    LineNumber = GetLineNumber(method)
                });
            }
            
            // Add property nodes
            foreach (var property in _propertyFullNames.Distinct())
            {
                bool isExternal = IsExternalLibrary(property);
                
                graph.Nodes.Add(new D3Node
                {
                    Id = property,
                    Group = "property",
                    Label = property.Split('.').Last(),
                    Used = _usedProperties.Contains(property),
                    Type = GetPropertyType(property),
                    IsExternal = isExternal,
                    FilePath = GetFilePath(property),
                    LineNumber = GetLineNumber(property)
                });
            }
            
            // Add variable nodes
            foreach (var variable in _variableFullNames)
            {
                bool isExternal = IsExternalLibrary(variable);
                
                graph.Nodes.Add(new D3Node
                {
                    Id = variable,
                    Group = "variable",
                    Label = variable.Split('.').Last(),
                    Used = _usedVariables.Contains(variable),
                    Type = GetVariableType(variable),
                    IsExternal = isExternal,
                    FilePath = GetFilePath(variable),
                    LineNumber = GetLineNumber(variable)
                });
            }
            
            // Add external nodes for references that would be dangling otherwise
            foreach (var kvp in _methodCallMap)
            {
                foreach (var callee in kvp.Value)
                {
                    if (!_methodFullNames.Contains(callee))
                    {
                        bool isExternal = IsExternalLibrary(callee);
                        
                        graph.Nodes.Add(new D3Node
                        {
                            Id = callee,
                            Group = "external-method",
                            Label = callee.Split('.').Last(),
                            Used = true, // External nodes are always "used" since they're referenced
                            IsExternal = isExternal
                        });
                    }
                }
            }
            
            foreach (var kvp in _methodPropertyMap)
            {
                foreach (var property in kvp.Value)
                {
                    if (!_propertyFullNames.Contains(property))
                    {
                        bool isExternal = IsExternalLibrary(property);
                        
                        graph.Nodes.Add(new D3Node
                        {
                            Id = property,
                            Group = "external-property",
                            Label = property.Split('.').Last(),
                            Used = true, // External nodes are always "used" since they're referenced
                            IsExternal = isExternal
                        });
                    }
                }
            }

            // 4) Links:
            // (a) namespace -> class
            foreach (var className in _classNames)
            {
                var namespaceName = className.Split('.')[0];
                graph.Links.Add(new D3Link
                {
                    Source = namespaceName,
                    Target = className,
                    Type = "containment"
                });
            }
            
            // (b) class -> method
            foreach (var method in _methodFullNames)
            {
                int lastDot = method.LastIndexOf('.');
                if (lastDot > 0)
                {
                    string className = method.Substring(0, lastDot);
                    if (_classNames.Contains(className))
                    {
                        graph.Links.Add(new D3Link
                        {
                            Source = className,
                            Target = method,
                            Type = "containment"
                        });
                    }
                }
            }
            
            // (c) class -> property
            foreach (var property in _propertyFullNames)
            {
                int lastDot = property.LastIndexOf('.');
                if (lastDot > 0)
                {
                    string className = property.Substring(0, lastDot);
                    if (_classNames.Contains(className))
                    {
                        graph.Links.Add(new D3Link
                        {
                            Source = className,
                            Target = property,
                            Type = "containment"
                        });
                    }
                }
            }
            
            // (d) method -> variable (variables belong to methods)
            foreach (var variable in _variableFullNames)
            {
                int lastDot = variable.LastIndexOf('.');
                if (lastDot > 0)
                {
                    string container = variable.Substring(0, lastDot);
                    
                    // Check if this is a method variable or class field
                    if (_methodFullNames.Contains(container))
                    {
                        // Method variable
                        graph.Links.Add(new D3Link
                        {
                            Source = container,
                            Target = variable,
                            Type = "containment"
                        });
                    }
                    else if (_classNames.Contains(container))
                    {
                        // Class field
                        graph.Links.Add(new D3Link
                        {
                            Source = container,
                            Target = variable,
                            Type = "containment"
                        });
                    }
                }
            }
            
            // (e) method -> property usage 
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
            
            // (f) method calls
            foreach (var kvp in _methodCallMap)
            {
                string caller = kvp.Key;
                foreach (var callee in kvp.Value)
                {
                    // Skip self-calls (they clutter the graph)
                    if (caller != callee)
                    {
                        // External calls get a different edge type
                        string linkType = _methodFullNames.Contains(callee) ? "call" : "external";
                        
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

        /// <summary>
        /// Get the file path for a node if available
        /// </summary>
        private string GetFilePath(string nodeId)
        {
            if (_nodeLocations.ContainsKey(nodeId))
            {
                return _nodeLocations[nodeId].FilePath;
            }
            return "";
        }
        
        /// <summary>
        /// Get the line number for a node if available
        /// </summary>
        private int GetLineNumber(string nodeId)
        {
            if (_nodeLocations.ContainsKey(nodeId))
            {
                return _nodeLocations[nodeId].LineNumber;
            }
            return 0;
        }
        
        /// <summary>
        /// Get the type for a property if available
        /// </summary>
        private string GetPropertyType(string propertyId)
        {
            if (_variableTypeMap.ContainsKey(propertyId))
            {
                return _variableTypeMap[propertyId];
            }
            return "Unknown";
        }
        
        /// <summary>
        /// Get the type for a variable if available
        /// </summary>
        private string GetVariableType(string variableId)
        {
            if (_variableTypeMap.ContainsKey(variableId))
            {
                return _variableTypeMap[variableId];
            }
            return "Unknown";
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
        public string Type { get; set; } // e.g. 'int', 'string', 'MyCustomClass'
        public string FilePath { get; set; } // File path where this element is defined
        public int LineNumber { get; set; } // Line number in the file where this element is defined
        public bool IsExternal { get; set; } = false; // Indicates if this node is from an external library
    }

    public class D3Link
    {
        public string Source { get; set; }
        public string Target { get; set; }
        public string Type { get; set; }
    }
    
    /// <summary>
    /// This is a test class with unused elements to verify the unused code detection
    /// </summary>
    public class UnusedElementsTest
    {
        // This property is never used anywhere - should be marked as unused
        public string UnusedProperty { get; set; }
        
        // This is a used property - referenced in the UsedMethod below
        public int UsedProperty { get; set; }
        
        // This method is never called - should be marked as unused
        public void UnusedMethod()
        {
            Console.WriteLine("I'm never called!");
        }
        
        // This method is used because it's called by TestMethod
        public void UsedMethod()
        {
            // Reference the UsedProperty to mark it as used
            int x = UsedProperty;
            Console.WriteLine($"Using property: {x}");
        }
        
        // This method calls UsedMethod - making it used
        public void TestMethod()
        {
            // Call the UsedMethod to mark it as used
            UsedMethod();
        }
    }
}
