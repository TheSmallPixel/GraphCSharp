/**
 * Core Graph Visualization Module
 * Handles the core visualization functionality, including:
 * - Initialization
 * - Graph drawing
 * - Layout management
 * - Zoom and pan behavior
 */

// Global variables for visualization
let svg;
let gContainer;
let zoomBehavior;
let simulation;
let currentLayout = 'force';

/**
 * Initialize the visualization
 */
async function initVisualization() {
  try {
    console.log('Initializing visualization...');
    
    // Show loading overlay during initialization
    showLoading();
    
    // Load data
    await loadGraph();
    
    // Setup visualization components
    setupVisualization();
    
    // Initialize filters
    initializeFilters();
    
    // Add custom styles
    addStyles();
    
    // Hide loading overlay when complete
    hideLoading();
  } catch (error) {
    console.error('Error initializing visualization:', error);
    alert('Failed to initialize visualization: ' + error.message);
  }
}

/**
 * Set up the visualization after data is loaded
 */
function setupVisualization() {
  console.log("Setting up visualization...");
  
  // Create SVG and container for the visualization
  svg = d3.select('#chart')
    .append('svg')
    .attr('width', '100%')
    .attr('height', '100%');
  
  // Add a background rect to handle zoom events on empty space
  svg.append('rect')
    .attr('width', '100%')
    .attr('height', '100%')
    .attr('fill', 'transparent');
  
  gContainer = svg.append('g')
    .attr('class', 'everything');
  
  // Setup zoom behavior
  zoomBehavior = d3.zoom()
    .scaleExtent([0.1, 10])
    .on('zoom', (event) => {
      gContainer.attr('transform', event.transform);
    });
  
  svg.call(zoomBehavior);
  
  // Process data
  processData();
  
  // Draw graph
  drawGraph();
  
  // Initialize force layout
  initializeForceLayout();
  
  console.log("Visualization setup complete");
}

/**
 * Initialize the force-directed layout
 */
function initializeForceLayout() {
  console.log("Initializing force layout...");
  
  // Get SVG dimensions
  const width = chartContainer.clientWidth;
  const height = chartContainer.clientHeight;
  
  // Create force simulation
  simulation = d3.forceSimulation(graph.nodes)
    .force('link', d3.forceLink(graph.links)
      .id(d => d.id)
      .distance(80))
    .force('charge', d3.forceManyBody().strength(-200))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide().radius(30))
    .on('tick', () => {
      // Update node positions
      gContainer.selectAll('.node')
        .attr('transform', d => `translate(${d.x},${d.y})`);
      
      // Update link positions
      gContainer.selectAll('.link')
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);
    });
  
  console.log("Force layout initialized");
}

/**
 * Draw the graph
 */
function drawGraph() {
  console.log("Drawing graph...");
  
  // Clear previous graph elements
  gContainer.selectAll('*').remove();
  
  // Create links
  const links = gContainer.selectAll('.link')
    .data(graph.links)
    .enter()
    .append('line')
    .attr('class', d => `link ${d.type}`)
    .style('stroke', d => getLinkColor(d))
    .style('stroke-width', 1.5);
  
  // Create nodes
  const nodes = gContainer.selectAll('.node')
    .data(graph.nodes)
    .enter()
    .append('g')
    .attr('class', d => `node ${d.used ? 'used' : 'unused'}`)
    .attr('data-id', d => d.id)
    .attr('data-group', d => d.group)
    .attr('data-used', d => d.used ? 'true' : 'false')
    .attr('data-external', d => d.isexternal ? 'true' : 'false')
    .call(d3.drag()
      .on('start', dragstarted)
      .on('drag', dragged)
      .on('end', dragended))
    .on('mouseover', nodeMouseOver)
    .on('mouseout', nodeMouseOut)
    .on('click', nodeClicked);
  
  // Add node circles
  nodes.append('circle')
    .attr('r', d => getNodeRadius(d))
    .style('fill', d => getNodeColor(d))
    .style('stroke', '#fff')
    .style('stroke-width', 1.5);
  
  // Add node labels
  nodes.append('text')
    .attr('dy', 4)
    .attr('text-anchor', 'middle')
    .text(d => d.name || d.label || d.id.split('.').pop())
    .style('font-size', '10px')
    .style('fill', 'black')
    .style('stroke', 'white')
    .style('stroke-width', '0.7px')
    .style('paint-order', 'stroke')
    .style('font-weight', 'bold')
    .style('text-shadow', 'none') // Explicitly remove any text shadow
    .style('pointer-events', 'none');
  
  console.log("Graph drawing complete");
  
  // Apply initial filters
  setTimeout(applyFilters, 100);
}

/**
 * Switch to hierarchical layout
 */
function switchToHierarchicalLayout() {
  if (currentLayout === 'hierarchical') return;
  
  console.log("Switching to hierarchical layout");
  currentLayout = 'hierarchical';
  
  // Stop force simulation
  if (simulation) simulation.stop();
  
  // Clear current graph
  gContainer.selectAll('*').remove();
  
  // Create hierarchical structure
  const hierarchy = createHierarchy();
  
  // Get SVG dimensions
  const width = chartContainer.clientWidth;
  const height = chartContainer.clientHeight;
  
  // Create tree layout
  const treeLayout = d3.tree()
    .size([width - 100, height - 100]);
  
  // Compute layout
  const rootNode = d3.hierarchy(hierarchy);
  treeLayout(rootNode);
  
  // Create links
  const links = gContainer.selectAll('.link')
    .data(rootNode.links())
    .enter()
    .append('path')
    .attr('class', 'link')
    .attr('d', d3.linkHorizontal()
      .x(d => d.y + 50)
      .y(d => d.x + height / 2 - rootNode.height * 20))
    .style('stroke', '#999')
    .style('stroke-opacity', 0.6)
    .style('fill', 'none');
  
  // Create nodes
  const nodes = gContainer.selectAll('.node')
    .data(rootNode.descendants())
    .enter()
    .append('g')
    .attr('class', d => `node ${d.data.used ? 'used' : 'unused'}`)
    .attr('transform', d => `translate(${d.y + 50},${d.x + height / 2 - rootNode.height * 20})`)
    .on('click', (event, d) => {
      // Find the original node in the graph
      const originalNode = graph.nodes.find(n => n.id === d.data.id);
      if (originalNode) {
        nodeClicked(event, originalNode);
      }
    });
  
  // Add node circles
  nodes.append('circle')
    .attr('r', 5)
    .style('fill', d => getNodeColor(d.data))
    .style('stroke', '#fff')
    .style('stroke-width', 1.5);
  
  // Add node labels
  nodes.append('text')
    .attr('x', d => d.children ? -8 : 8)
    .attr('dy', 3)
    .style('text-anchor', d => d.children ? 'end' : 'start')
    .text(d => d.data.name || d.data.label || d.data.id.split('.').pop())
    .style('font-size', '10px')
    .style('fill', 'black')
    .style('stroke', 'white')
    .style('stroke-width', '0.7px')
    .style('paint-order', 'stroke');
  
  applyFilters();
}

/**
 * Switch to force-directed layout
 */
function switchToForceDirectedLayout() {
  if (currentLayout === 'force') return;
  
  console.log("Switching to force-directed layout");
  currentLayout = 'force';
  
  // Redraw graph with force layout
  drawGraph();
  initializeForceLayout();
}

/**
 * Create a hierarchical structure from the graph
 */
function createHierarchy() {
  // Start with namespaces at the top level
  const root = { id: 'root', name: 'Root', children: [] };
  
  // First, create all namespace nodes
  const namespaceNodes = graph.nodes.filter(n => n.group === 'namespace');
  
  namespaceNodes.forEach(namespace => {
    root.children.push({
      id: namespace.id,
      name: namespace.label || namespace.id,
      group: namespace.group,
      used: namespace.used,
      children: []
    });
  });
  
  // Add classes to their namespaces
  const classNodes = graph.nodes.filter(n => n.group === 'class');
  
  classNodes.forEach(classNode => {
    // Find the namespace this class belongs to
    const namespaceParts = classNode.id.split('.');
    const namespaceId = namespaceParts.slice(0, -1).join('.');
    
    const namespaceObj = findNodeInHierarchy(root, namespaceId);
    if (namespaceObj) {
      namespaceObj.children.push({
        id: classNode.id,
        name: classNode.label || classNode.name || classNode.id.split('.').pop(),
        group: classNode.group,
        used: classNode.used,
        children: []
      });
    }
  });
  
  // Add methods and properties to their classes
  const memberNodes = graph.nodes.filter(n => n.group === 'method' || n.group === 'property');
  
  memberNodes.forEach(memberNode => {
    // Find the class this member belongs to
    const memberParts = memberNode.id.split('.');
    const classId = memberParts.slice(0, -1).join('.');
    
    const classObj = findNodeInHierarchy(root, classId);
    if (classObj) {
      classObj.children.push({
        id: memberNode.id,
        name: memberNode.label || memberNode.name || memberNode.id.split('.').pop(),
        group: memberNode.group,
        used: memberNode.used
      });
    }
  });
  
  return root;
}

/**
 * Find a node in the hierarchy by ID
 */
function findNodeInHierarchy(root, id) {
  if (root.id === id) return root;
  
  if (root.children) {
    for (const child of root.children) {
      const found = findNodeInHierarchy(child, id);
      if (found) return found;
    }
  }
  
  return null;
}

/**
 * Drag event handlers
 */
function dragstarted(event, d) {
  if (!event.active) simulation.alphaTarget(0.3).restart();
  d.fx = d.x;
  d.fy = d.y;
}

function dragged(event, d) {
  d.fx = event.x;
  d.fy = event.y;
}

function dragended(event, d) {
  if (!event.active) simulation.alphaTarget(0);
  d.fx = null;
  d.fy = null;
}

/**
 * Zoom behavior functions
 */
function zoomed(event) {
  gContainer.attr('transform', event.transform);
}

/**
 * Zoom to a specific node
 */
function zoomToNode(node) {
  // Get the current transform
  const currentTransform = d3.zoomTransform(svg.node());
  
  // Create a new transform centered on the node
  const targetX = width / 2 - node.x * currentTransform.k;
  const targetY = height / 2 - node.y * currentTransform.k;
  
  // Smoothly transition to the new transform
  svg.transition()
    .duration(750)
    .call(
      zoomBehavior.transform,
      d3.zoomIdentity
        .translate(targetX, targetY)
        .scale(currentTransform.k)
    );
}

/**
 * Reset zoom to show the entire graph
 */
function resetZoom() {
  svg.transition()
    .duration(750)
    .call(
      zoomBehavior.transform,
      d3.zoomIdentity.translate(0, 0).scale(1)
    );
}

/**
 * Show loading overlay
 */
function showLoading() {
  if (loadingOverlay) {
    loadingOverlay.style.display = 'flex';
  }
}

/**
 * Hide loading overlay
 */
function hideLoading() {
  if (loadingOverlay) {
    loadingOverlay.style.display = 'none';
  }
}

// Initialize when the document is loaded
document.addEventListener('DOMContentLoaded', function() {
  // DOM Elements
  chartContainer = document.getElementById('chart');
  detailPanel = document.getElementById('detail-panel');
  loadingOverlay = document.getElementById('loading-overlay');
  tooltip = document.getElementById('tooltip');
  filterContainer = document.getElementById('filters');
  
  // Initialize visualization
  initVisualization();
  
  // Layout control buttons
  document.getElementById('force-layout').addEventListener('click', switchToForceDirectedLayout);
  document.getElementById('hierarchical-layout').addEventListener('click', switchToHierarchicalLayout);
  document.getElementById('reset-zoom').addEventListener('click', resetZoom);
  document.getElementById('reset-filters').addEventListener('click', resetAllFilters);
});
