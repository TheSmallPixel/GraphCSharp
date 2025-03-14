/**
 * Graph Data Processing Module
 * Handles data loading, parsing, and processing including:
 * - Graph data loading
 * - Data transformation and analysis
 * - Node and link relationship mapping
 */

// Data structure variables
let graph = { nodes: [], links: [] };
let graphData = {};
let nodeMap = new Map();
let nodeUsageCounts = new Map();
let nodeRelationships = new Map();
let namespaces = new Set();

/**
 * Load the graph data from the data file
 */
async function loadGraph() {
  console.log("Loading graph data...");
  
  try {
    const response = await fetch('graph_data.json');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    graphData = await response.json();
    graph = graphData;
    
    // Build node map for quick lookups
    graph.nodes.forEach(node => {
      nodeMap.set(node.id, node);
      
      // Extract namespace information
      if (node.group === 'namespace') {
        namespaces.add(node.id);
      } else if (node.id.includes('.')) {
        const namespaceParts = node.id.split('.');
        if (namespaceParts.length > 1) {
          // For classes, methods, etc. extract their namespace
          const nodeNamespace = namespaceParts.slice(0, -1).join('.');
          namespaces.add(nodeNamespace);
        }
      }
    });
    
    console.log(`Loaded ${graph.nodes.length} nodes and ${graph.links.length} links`);
    
    // Update statistics in the UI
    updateStatistics();
    
    return graph;
  } catch (error) {
    console.error("Error loading graph data:", error);
    throw error;
  }
}

/**
 * Process the graph data to analyze usage patterns
 */
function processData() {
  console.log("Processing graph data...");
  
  // Initialize usage counts
  graph.nodes.forEach(node => {
    nodeUsageCounts.set(node.id, 0);
  });
  
  // Count references for each node
  graph.links.forEach(link => {
    const targetId = typeof link.target === 'object' ? link.target.id : link.target;
    
    // Increment the usage count for the target node
    if (nodeUsageCounts.has(targetId)) {
      nodeUsageCounts.set(targetId, nodeUsageCounts.get(targetId) + 1);
    }
    
    // Update node usage flag based on reference count
    if (nodeMap.has(targetId)) {
      const node = nodeMap.get(targetId);
      if (nodeUsageCounts.get(targetId) > 0) {
        node.used = true;
      }
    }
  });
  
  // Analyze node relationships
  buildNodeRelationships();
  
  console.log("Data processing complete");
}

/**
 * Build relationship maps for quick node relationship lookups
 */
function buildNodeRelationships() {
  console.log("Building node relationships...");
  
  // Initialize relationships map
  graph.nodes.forEach(node => {
    nodeRelationships.set(node.id, {
      inbound: [],
      outbound: []
    });
  });
  
  // Process links to populate relationship data
  graph.links.forEach(link => {
    const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
    const targetId = typeof link.target === 'object' ? link.target.id : link.target;
    
    // Add outbound relationship to source node
    if (nodeRelationships.has(sourceId)) {
      nodeRelationships.get(sourceId).outbound.push({
        nodeId: targetId,
        type: link.type || 'unknown'
      });
    }
    
    // Add inbound relationship to target node
    if (nodeRelationships.has(targetId)) {
      nodeRelationships.get(targetId).inbound.push({
        nodeId: sourceId,
        type: link.type || 'unknown'
      });
    }
  });
  
  console.log("Node relationships built");
}

/**
 * Update statistics in the sidebar
 */
function updateStatistics() {
  // Count different types of nodes
  const namespaceCount = graph.nodes.filter(n => n.group === 'namespace').length;
  const classCount = graph.nodes.filter(n => n.group === 'class').length;
  const methodCount = graph.nodes.filter(n => n.group === 'method').length;
  const propertyCount = graph.nodes.filter(n => n.group === 'property').length;
  
  // Count unused nodes
  const unusedNodes = graph.nodes.filter(n => !n.used).length;
  const usedNodes = graph.nodes.length - unusedNodes;
  
  // Update statistics in the DOM
  document.getElementById('namespace-count').textContent = namespaceCount;
  document.getElementById('class-count').textContent = classCount;
  document.getElementById('method-count').textContent = methodCount;
  document.getElementById('property-count').textContent = propertyCount;
  document.getElementById('total-count').textContent = graph.nodes.length;
  
  // Calculate usage ratio
  const usageRatio = (usedNodes / graph.nodes.length * 100).toFixed(1);
  document.getElementById('used-count').textContent = usedNodes;
  document.getElementById('unused-count').textContent = unusedNodes;
  document.getElementById('usage-ratio').textContent = `${usageRatio}%`;
}

/**
 * Get node relationships
 */
function getNodeRelationships(nodeId) {
  return nodeRelationships.get(nodeId) || { inbound: [], outbound: [] };
}

/**
 * Get the usage count for a node
 */
function getNodeUsageCount(nodeId) {
  return nodeUsageCounts.get(nodeId) || 0;
}

/**
 * Search for nodes by name or ID
 */
function searchNodes(query) {
  if (!query || query.trim() === '') {
    return [];
  }
  
  query = query.toLowerCase();
  
  // Search for nodes that match the query in their ID or label
  return graph.nodes.filter(node => {
    const nodeId = node.id.toLowerCase();
    const nodeLabel = (node.label || '').toLowerCase();
    const nodeName = (node.name || '').toLowerCase();
    
    return nodeId.includes(query) || 
           nodeLabel.includes(query) || 
           nodeName.includes(query);
  });
}

/**
 * Get list of namespaces
 */
function getNamespacesList() {
  return Array.from(namespaces);
}
