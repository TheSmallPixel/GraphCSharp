// Enhanced C# Code Graph Visualizer
document.addEventListener('DOMContentLoaded', function() {
  // Global variables
  let graph;
  let svg;
  let gContainer;
  let zoomBehavior;
  let simulation;
  let nodeUsageCounts = new Map();
  let nodeReferences = new Map();
  let selectedNode = null;
  let currentLayout = 'force';
  let highlightUnused = false;

  // DOM Elements
  let chartContainer = document.getElementById('chart');
  let detailPanel = document.getElementById('detail-panel');
  let loadingOverlay = document.getElementById('loading-overlay');
  let tooltip = document.getElementById('tooltip');
  let filterContainer = document.getElementById('filters');
  
  // Track current visualization state
  let unusedElements = new Set();
  
  // Load and initialize visualization
  async function initVisualization() {
    try {
      console.log('Initializing visualization...');
      
      // Create SVG element first
      chartContainer = document.getElementById('chart');
      if (!chartContainer) {
        console.error("Chart container not found");
        return;
      }
      
      // Get container dimensions
      const width = chartContainer.clientWidth || 960;
      const height = chartContainer.clientHeight || 600;
      
      // Set up zoom behavior before loading data
      zoomBehavior = d3.zoom()
        .scaleExtent([0.1, 8])
        .on('zoom', (event) => {
          gContainer.attr('transform', event.transform);
        });
      
      // Create SVG with proper dimensions
      svg = d3.select('#chart')
        .append('svg')
        .attr('width', width)
        .attr('height', height)
        .attr('viewBox', `0 0 ${width} ${height}`)
        .call(zoomBehavior);
      
      // Add group for zoom transforms
      gContainer = svg.append('g');
      
      // Load data
      graph = await d3.json('graph.json');
      console.log(`Loaded graph data: ${graph.nodes.length} nodes, ${graph.links.length} links`);
      
      // Initialize the visualization
      initializeForceLayout();
      
      // Set up event listeners
      setupEventListeners();
      
      // Calculate stats
      updateStats();
      
      // Apply filters
      setTimeout(() => {
        applyFilters();
        console.log('Visualization fully initialized');
      }, 200);
      
    } catch (error) {
      console.error('Error initializing visualization:', error);
    }
  }
  
  // Set up the visualization after data is loaded
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
    
    console.log("Visualization setup complete");
  }
  
  // Initialize force layout
  function initializeForceLayout() {
    console.log("Initializing force layout...");
    
    // Make sure we have SVG and container elements
    if (!svg || !gContainer) {
      console.error("SVG or container not properly initialized");
      return;
    }
    
    // Get width and height from SVG
    const svgEl = svg.node();
    const width = svgEl.clientWidth || 960;
    const height = svgEl.clientHeight || 600;
    
    // Clear any existing elements
    gContainer.selectAll('*').remove();
    
    // Initialize the force simulation with explicit dimensions
    simulation = d3.forceSimulation(graph.nodes)
      .force('link', d3.forceLink(graph.links)
        .id(d => d.id)
        .distance(100)
      )
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(30));
    
    // Update simulation on tick
    simulation.on('tick', () => {
      gContainer.selectAll('.link')
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);
      
      gContainer.selectAll('.node')
        .attr('transform', d => `translate(${d.x}, ${d.y})`);
    });
    
    // Draw the graph
    drawGraph();
    
    console.log("Force layout initialized");
  }
  
  // Load graph data
  function loadGraph() {
    console.log("Loading graph data...");
    d3.json('graph.json')
      .then(data => {
        console.log("Graph data loaded successfully");
        // Store the data
        graph = data;
        
        // Ensure all nodes have the required properties
        graph.nodes.forEach(node => {
          // Make sure all properties exist
          node.group = node.group || '';
          node.label = node.label || '';
          node.id = node.id || '';
          node.used = node.used || false;
          
          // Convert isexternal from string to boolean if needed
          // This handles potential issues with JSON serialization
          if (typeof node.isexternal === 'string') {
            node.isexternal = node.isexternal.toLowerCase() === 'true';
          } else {
            node.isexternal = Boolean(node.isexternal);
          }
          
          console.log(`Node ${node.id}: isexternal=${node.isexternal} (${typeof node.isexternal}), group=${node.group}, used=${node.used}`);
        });
        
        // Set up visualization
        setupVisualization();
      })
      .catch(error => {
        console.error('Error loading graph data:', error);
        alert("Failed to load graph data. Check the console for details.");
      });
  }
  
  // Process the data to analyze usage patterns
  function processData() {
    // Initialize node usage counts
    graph.nodes.forEach(node => {
      nodeUsageCounts.set(node.id, 0);
      nodeReferences.set(node.id, { incoming: [], outgoing: [] });
    });
    
    // Count references for each node
    countNodeReferences();
    
    // Identify unused elements (methods and properties with no incoming references)
    graph.nodes.forEach(node => {
      if ((node.group === 'method' || node.group === 'property') && 
          nodeUsageCounts.get(node.id) <= 1) { // 1 reference could be just the containment link
        
        // Check if it only has a containment reference
        const refs = nodeReferences.get(node.id);
        if (refs.incoming.length <= 1 && 
            (!refs.incoming[0] || refs.incoming[0].type === 'containment')) {
          unusedElements.add(node.id);
          node.used = false;
        }
      }
    });
  }
  
  // Count references for each node
  function countNodeReferences() {
    // Reset counts
    graph.nodes.forEach(node => {
      nodeUsageCounts.set(node.id, 0);
      nodeReferences.set(node.id, { incoming: [], outgoing: [] });
    });
    
    // Count references
    graph.links.forEach(link => {
      const sourceId = link.source.id || link.source;
      const targetId = link.target.id || link.target;
      
      // Increment target's incoming count 
      nodeUsageCounts.set(targetId, (nodeUsageCounts.get(targetId) || 0) + 1);
      
      // Add to reference tracking
      if (nodeReferences.has(sourceId)) {
        nodeReferences.get(sourceId).outgoing.push(targetId);
      }
      
      if (nodeReferences.has(targetId)) {
        nodeReferences.get(targetId).incoming.push(sourceId);
      }
    });
    
    // Synchronize usage count with used flag
    // Any node with references should be marked as used
    graph.nodes.forEach(node => {
      const usageCount = nodeUsageCounts.get(node.id) || 0;
      if (usageCount > 0) {
        node.used = true;
      }
    });
  }
  
  // Draw the graph
  function drawGraph() {
    console.log("Drawing graph...");
    
    // Clear previous graph elements
    gContainer.selectAll('*').remove();
    
    // Create links
    const links = gContainer.selectAll('.link')
      .data(graph.links)
      .enter()
      .append('line')
      .attr('class', 'link')
      .attr('data-id', (d, i) => `link-${i}`)
      .attr('data-source', d => typeof d.source === 'object' ? d.source.id : d.source)
      .attr('data-target', d => typeof d.target === 'object' ? d.target.id : d.target)
      .attr('data-type', d => d.type || 'default')
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
      .style('fill', '#fff')
      .style('pointer-events', 'none');
    
    console.log("Graph drawing complete");
    
    // Apply initial filters
    setTimeout(applyFilters, 100);
  }
  
  // Get node color based on its type and status
  function getNodeColor(d) {
    // If node is not used, return unused color
    if (d.used === false) {
      return getComputedStyle(document.documentElement).getPropertyValue('--unused-color');
    }
    
    // External nodes get the external color
    if (d.isexternal === true) {
      return getComputedStyle(document.documentElement).getPropertyValue('--external-color');
    }
    
    // Return color based on node type
    switch (d.group) {
      case 'namespace':
        return getComputedStyle(document.documentElement).getPropertyValue('--namespace-color');
      case 'class':
        return getComputedStyle(document.documentElement).getPropertyValue('--class-color');
      case 'interface':
        return getComputedStyle(document.documentElement).getPropertyValue('--type-color');
      case 'method':
        return getComputedStyle(document.documentElement).getPropertyValue('--method-color');
      case 'property':
        return getComputedStyle(document.documentElement).getPropertyValue('--property-color');
      case 'variable':
        return getComputedStyle(document.documentElement).getPropertyValue('--variable-color');
      default:
        return '#999';
    }
  }
  
  // Get link color based on its type
  function getLinkColor(d) {
    switch (d.type) {
      case 'containment':
        return getComputedStyle(document.documentElement).getPropertyValue('--link-color');
      case 'call':
        return '#555';
      case 'reference':
        return 'blue';
      case 'external':
        return getComputedStyle(document.documentElement).getPropertyValue('--external-color');
      default:
        return '#ccc';
    }
  }
  
  // Function to get node radius
  function getNodeRadius(node) {
    if (node.group === 'namespace') return 12;
    if (node.group === 'class') return 10;
    if (node.group === 'method') return 7;
    if (node.group === 'property') return 7;
    if (node.group === 'variable') return 5;
    return 6;
  }
  
  // Switch to hierarchical layout
  function switchToHierarchicalLayout() {
    currentLayout = 'hierarchical';
    
    // Stop the simulation
    if (simulation) simulation.stop();
    
    // Create a hierarchical layout
    const hierarchy = createHierarchy();
    const treeLayout = d3.tree().size([chartContainer.clientWidth - 100, chartContainer.clientHeight - 100]);
    const root = treeLayout(hierarchy);
    
    // Update node positions based on tree layout
    const nodes = gContainer.selectAll('.node');
    const links = gContainer.selectAll('.link');
    
    // Transition nodes to their new positions
    nodes.transition().duration(1000)
      .attr('transform', d => {
        // Find the node in the hierarchy
        const hierarchyNode = findNodeInHierarchy(root, d.id);
        if (hierarchyNode) {
          d.x = hierarchyNode.x;
          d.y = hierarchyNode.y;
        }
        return `translate(${d.x}, ${d.y})`;
      });
    
    // Update links with animation
    links.transition().duration(1000)
      .attr('x1', d => d.source.x)
      .attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x)
      .attr('y2', d => d.target.y);
  }
  
  // Switch to force-directed layout
  function switchToForceDirectedLayout() {
    currentLayout = 'force';
    
    // Restart the simulation
    if (simulation) {
      simulation.alpha(0.3).restart();
    }
  }
  
  // Create a hierarchical structure from the graph
  function createHierarchy() {
    // Find a root node (likely a namespace)
    const rootId = graph.nodes.find(n => n.group === 'namespace')?.id || graph.nodes[0].id;
    
    // Create a hierarchy data structure
    const hierarchyData = {
      id: rootId,
      children: []
    };
    
    // Build tree from containment links
    const childrenMap = new Map();
    
    // Initialize all nodes as potential children
    graph.nodes.forEach(node => {
      if (node.id !== rootId) {
        childrenMap.set(node.id, { id: node.id, children: [] });
      }
    });
    
    // Process containment links to build parent-child relationships
    graph.links.forEach(link => {
      if (link.type === 'containment') {
        const parent = childrenMap.get(link.source) || 
                     (link.source === rootId ? hierarchyData : null);
        const child = childrenMap.get(link.target);
        
        if (parent && child) {
          parent.children.push(child);
          // Remove from top-level map since it's now a child
          childrenMap.delete(link.target);
        }
      }
    });
    
    // Add remaining nodes as children of the root
    childrenMap.forEach(node => {
      if (node.id !== rootId) {
        hierarchyData.children.push(node);
      }
    });
    
    return d3.hierarchy(hierarchyData);
  }
  
  // Find a node in the hierarchy by ID
  function findNodeInHierarchy(root, id) {
    if (root.data.id === id) return root;
    
    if (root.children) {
      for (let child of root.children) {
        const found = findNodeInHierarchy(child, id);
        if (found) return found;
      }
    }
    
    return null;
  }
  
  // Focus on a specific node in the visualization
  function focusNode(node) {
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
    
    // Highlight the node and its connections
    highlightNodeConnections(node.id);
  }
  
  // Highlight connections for a node
  function highlightNodeConnections(nodeId) {
    console.log("Highlighting connections for node:", nodeId);
    
    // Reset previous highlights
    resetHighlights();
    
    // Find connected nodes
    const connectedNodeIds = new Set();
    connectedNodeIds.add(nodeId); // Add the selected node itself
    
    // Identify all connected nodes through links
    gContainer.selectAll('.link').each(function(d) {
      const sourceId = typeof d.source === 'object' ? d.source.id : d.source;
      const targetId = typeof d.target === 'object' ? d.target.id : d.target;
      
      if (sourceId === nodeId) {
        connectedNodeIds.add(targetId);
      } else if (targetId === nodeId) {
        connectedNodeIds.add(sourceId);
      }
    });
    
    // Apply faded class to all nodes and links
    gContainer.selectAll('.node').classed('faded', true);
    gContainer.selectAll('.link').classed('faded', true);
    
    // Remove faded class from the selected node and its connections
    gContainer.select(`.node[data-id="${nodeId}"]`).classed('faded', false).classed('highlighted', true);
    
    // Highlight connected nodes
    connectedNodeIds.forEach(id => {
      if (id !== nodeId) { // Skip the selected node (already highlighted)
        gContainer.select(`.node[data-id="${id}"]`).classed('faded', false).classed('connected', true);
      }
    });
    
    // Highlight links connecting to the selected node
    gContainer.selectAll('.link').each(function(d) {
      const sourceId = typeof d.source === 'object' ? d.source.id : d.source;
      const targetId = typeof d.target === 'object' ? d.target.id : d.target;
      
      if (sourceId === nodeId || targetId === nodeId) {
        d3.select(this).classed('faded', false).classed('highlighted', true);
      }
    });
    
    console.log("Highlighted node and connections");
  }
  
  // Reset all highlights
  function resetHighlights() {
    gContainer.selectAll('.node').classed('faded', false).classed('highlighted', false).classed('connected', false);
    gContainer.selectAll('.link').classed('faded', false).classed('highlighted', false);
  }
  
  // Reset zoom to show the entire graph
  function resetZoom() {
    const width = chartContainer.clientWidth;
    const height = chartContainer.clientHeight;
    
    svg.transition().duration(750)
      .call(zoomBehavior.transform, d3.zoomIdentity
        .translate(width / 2, height / 2)
        .scale(0.8));
  }
  
  // Update statistics in the sidebar
  function updateStatistics() {
    const stats = {
      namespace: 0,
      class: 0,
      method: 0,
      property: 0,
      unused: unusedElements.size
    };
    
    // Count each type of node
    graph.nodes.forEach(node => {
      if (stats.hasOwnProperty(node.group)) {
        stats[node.group]++;
      }
    });
    
    // Update DOM
    document.getElementById('namespace-count').textContent = stats.namespace;
    document.getElementById('class-count').textContent = stats.class;
    document.getElementById('method-count').textContent = stats.method;
    document.getElementById('property-count').textContent = stats.property;
    document.getElementById('unused-count').textContent = stats.unused;
  }
  
  // Get icon for node type
  function getIconForNodeType(type) {
    switch(type) {
      case 'namespace': return 'fa-cubes';
      case 'class': return 'fa-cube';
      case 'method': return 'fa-code';
      case 'property': return 'fa-database';
      case 'variable': return 'fa-font';
      case 'type': return 'fa-code-branch';
      default: return 'fa-circle';
    }
  }
  
  // Get color for node type
  function getColorForNodeType(type) {
    const colorMap = {
      namespace: getComputedStyle(document.documentElement).getPropertyValue('--namespace-color'),
      class: getComputedStyle(document.documentElement).getPropertyValue('--class-color'),
      method: getComputedStyle(document.documentElement).getPropertyValue('--method-color'),
      property: getComputedStyle(document.documentElement).getPropertyValue('--property-color'),
      variable: getComputedStyle(document.documentElement).getPropertyValue('--variable-color'),
      type: getComputedStyle(document.documentElement).getPropertyValue('--type-color')
    };
    
    return colorMap[type] || '#ccc';
  }
  
  // Initialize event listeners
  function setupEventListeners() {
    console.log("Setting up event listeners...");
    
    // Set up node type filter listeners
    document.querySelectorAll('.node-filter').forEach(filter => {
      filter.addEventListener('change', () => {
        console.log('Node type filter changed:', filter.value, filter.checked);
        applyFilters();
      });
    });
    
    // Set up link type filter listeners
    document.querySelectorAll('.link-filter').forEach(filter => {
      filter.addEventListener('change', () => {
        console.log('Link type filter changed:', filter.value, filter.checked);
        applyFilters();
      });
    });
    
    // Set up usage filter listeners
    document.querySelectorAll('.usage-filter').forEach(filter => {
      filter.addEventListener('change', () => {
        console.log('Usage filter changed:', filter.value, filter.checked);
        applyFilters();
      });
    });
    
    // Set up library filter listeners
    document.querySelectorAll('.library-filter').forEach(filter => {
      filter.addEventListener('change', () => {
        console.log('Library filter changed:', filter.value, filter.checked);
        applyFilters();
      });
    });
    
    // Set up search input
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        handleSearch(searchTerm);
      });
    }
    
    // Clear selection when clicking on empty space
    svg.on('click', function(event) {
      if (event.target === this || event.target === gContainer.node()) {
        // Clear selection only if clicking on empty space
        selectedNode = null;
        resetHighlights();
        
        // Hide detail panel
        const detailPanel = document.getElementById('detail-panel');
        if (detailPanel) {
          detailPanel.classList.remove('active');
        }
      }
    });
    
    console.log("Event listeners set up");
  }
  
  // Update node colors based on current settings
  function updateNodeColors() {
    gContainer.selectAll('.node circle')
      .transition().duration(500)
      .attr('fill', d => {
        if (highlightUnused && !d.used) {
          return getComputedStyle(document.documentElement).getPropertyValue('--unused-color');
        }
        return getNodeColor(d);
      });
  }
  
  // Apply all filters
  function applyFilters() {
    console.log("Applying filters...");
    
    // Make sure the visualization is initialized
    if (!gContainer) {
      console.error("Cannot apply filters - gContainer not initialized");
      return;
    }
    
    // Get all checked filters by class
    const nodeTypes = Array.from(document.querySelectorAll('.node-filter:checked')).map(el => el.value);
    const linkTypes = Array.from(document.querySelectorAll('.link-filter:checked')).map(el => el.value);
    
    // Get usage filters (used/unused)
    const showUsed = document.getElementById('filter-used')?.checked ?? true;
    const showUnused = document.getElementById('filter-unused')?.checked ?? true;
    
    // Get library filters (internal/external)
    const showInternal = document.getElementById('filter-internal')?.checked ?? true;
    const showExternal = document.getElementById('filter-external')?.checked ?? true;
    
    console.log("Active filters:", {
      nodeTypes, 
      linkTypes, 
      usage: { showUsed, showUnused },
      origin: { showInternal, showExternal }
    });
    
    // Apply node filters
    gContainer.selectAll('.node').each(function(d) {
      const node = d3.select(this);
      let visible = true;
      
      // Check node type filter
      if (nodeTypes.length > 0 && !nodeTypes.includes(d.group)) {
        visible = false;
      }
      
      // Check usage filter
      if (visible) {
        if (d.used && !showUsed) visible = false;
        if (!d.used && !showUnused) visible = false;
      }
      
      // Check origin filter
      if (visible) {
        if (d.isexternal && !showExternal) visible = false;
        if (!d.isexternal && !showInternal) visible = false;
      }
      
      // Apply visibility
      node.style('display', visible ? null : 'none');
      node.attr('data-visible', visible ? 'true' : 'false');
    });
    
    // Apply link filters - hide links if either connected node is hidden
    gContainer.selectAll('.link').each(function(d) {
      const link = d3.select(this);
      let visible = true;
      
      // Check link type filter
      if (linkTypes.length > 0 && !linkTypes.includes(d.type)) {
        visible = false;
      }
      
      // Check connected nodes visibility
      if (visible) {
        const sourceId = typeof d.source === 'object' ? d.source.id : d.source;
        const targetId = typeof d.target === 'object' ? d.target.id : d.target;
        
        const sourceNode = gContainer.select(`.node[data-id="${sourceId}"]`);
        const targetNode = gContainer.select(`.node[data-id="${targetId}"]`);
        
        if (sourceNode.empty() || targetNode.empty() || 
            sourceNode.attr('data-visible') === 'false' || 
            targetNode.attr('data-visible') === 'false') {
          visible = false;
        }
      }
      
      // Apply visibility
      link.style('display', visible ? null : 'none');
    });
    
    console.log("Filters applied successfully");
  }
  
  // Handle search input
  function handleSearch(searchTerm) {
    if (!searchTerm) {
      // Reset all nodes and links to their filtered state
      applyFilters();
      return;
    }
    
    // First apply regular filters to update node.visible property
    applyFilters();
    
    // Then apply search term on top of that
    graph.nodes.forEach(node => {
      if (!node.visible) return; // Skip already hidden nodes
      
      // Hide node if it doesn't match search
      if (!node.id.toLowerCase().includes(searchTerm) && 
          !node.label.toLowerCase().includes(searchTerm)) {
        node.visible = false;
      }
    });
    
    // Update visibility in DOM
    gContainer.selectAll('.node')
      .style('display', d => d.visible ? 'block' : 'none');
    
    // Update links
    gContainer.selectAll('.link')
      .style('display', d => {
        // Get source and target nodes
        const source = typeof d.source === 'object' ? d.source.id : d.source;
        const target = typeof d.target === 'object' ? d.target.id : d.target;
        
        // Find the node objects
        const sourceNode = graph.nodes.find(n => n.id === source);
        const targetNode = graph.nodes.find(n => n.id === target);
        
        // If either node is not visible, hide the link
        if (!sourceNode || !targetNode || !sourceNode.visible || !targetNode.visible) {
          return 'none';
        }
        
        return 'block';
      });
  }
  
  // Update node stats
  function updateStats() {
    if (!graph || !graph.nodes) {
      console.log("Cannot update stats - graph data not loaded yet");
      return;
    }
  
    loadingOverlay.style.display = 'flex';
    
    setTimeout(() => {
      // Calculate stats directly
      const stats = {
        namespaces: graph.nodes.filter(n => n.group === 'namespace').length,
        classes: graph.nodes.filter(n => n.group === 'class').length,
        methods: graph.nodes.filter(n => n.group === 'method').length,
        properties: graph.nodes.filter(n => n.group === 'property').length,
        variables: graph.nodes.filter(n => n.group === 'variable').length,
        unused: graph.nodes.filter(n => !n.used).length,
        external: graph.nodes.filter(n => n.isexternal).length,
        internal: graph.nodes.filter(n => !n.isexternal).length,
        total: graph.nodes.length
      };
      
      // Update DOM with stats
      document.getElementById('namespace-count').textContent = stats.namespaces;
      document.getElementById('class-count').textContent = stats.classes;
      document.getElementById('method-count').textContent = stats.methods;
      document.getElementById('property-count').textContent = stats.properties;
      document.getElementById('unused-count').textContent = stats.unused;
      
      loadingOverlay.style.display = 'none';
    }, 0);
  }
  
  // Debug helper for filter nodes and links
  function debugNodeData() {
    console.group("Node Data Debug");
    gContainer.selectAll('.node').each(function(d, i) {
      if (i < 5) { // Limit to first 5 nodes for clarity
        console.log(`Node ${i}:`, {
          id: d.id,
          group: d.group,
          used: d.used,
          isexternal: d.isexternal
        });
      }
    });
    console.groupEnd();
  }
  
  // Drag event handlers
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
  
  // Hide loading overlay
  function hideLoading() {
    loadingOverlay.style.display = 'none';
  }
  
  // Show node information in the detail panel
  function showNodeDetails(node) {
    console.log("Showing details for node:", node);
    
    // Get detail panel elements
    const detailPanel = document.getElementById('detail-panel');
    const detailTitle = document.getElementById('detail-title');
    const detailContent = document.getElementById('detail-content');
    
    if (!detailPanel || !detailTitle || !detailContent) {
      console.error("Detail panel elements not found");
      return;
    }
    
    // Show detail panel
    detailPanel.classList.add('visible');
    
    // Set node title
    detailTitle.textContent = node.label || node.name || node.id.split('.').pop();
    
    // Clear previous content
    detailContent.innerHTML = '';
    
    // Add node information
    const nodeInfo = document.createElement('div');
    nodeInfo.className = 'node-info';
    
    // Node type
    const typeInfo = document.createElement('div');
    typeInfo.className = 'info-item';
    typeInfo.innerHTML = `<span class="info-label">Type:</span> <span class="info-value">${node.group}</span>`;
    nodeInfo.appendChild(typeInfo);
    
    // Full name/path
    const nameInfo = document.createElement('div');
    nameInfo.className = 'info-item';
    nameInfo.innerHTML = `<span class="info-label">Full Path:</span> <span class="info-value">${node.id}</span>`;
    nodeInfo.appendChild(nameInfo);
    
    // Usage status
    const usageInfo = document.createElement('div');
    usageInfo.className = 'info-item';
    usageInfo.innerHTML = `<span class="info-label">Used:</span> <span class="info-value ${node.used ? 'used' : 'unused'}">${node.used ? 'Yes' : 'No'}</span>`;
    nodeInfo.appendChild(usageInfo);
    
    // Origin
    const originInfo = document.createElement('div');
    originInfo.className = 'info-item';
    originInfo.innerHTML = `<span class="info-label">Origin:</span> <span class="info-value">${node.isexternal ? 'External Library' : 'Internal'}</span>`;
    nodeInfo.appendChild(originInfo);
    
    detailContent.appendChild(nodeInfo);
    
    // Add section for related nodes
    const relatedTitle = document.createElement('h3');
    relatedTitle.textContent = 'Related Nodes';
    detailContent.appendChild(relatedTitle);
    
    // Find connected nodes
    const connected = findConnectedNodes(node.id);
    
    if (connected.length > 0) {
      const connectedList = document.createElement('ul');
      connectedList.className = 'connected-list';
      
      connected.forEach(conn => {
        const connNode = graph.nodes.find(n => n.id === conn.id);
        if (connNode) {
          const listItem = document.createElement('li');
          listItem.className = 'connected-item';
          
          const relationType = document.createElement('span');
          relationType.className = 'relation-type';
          relationType.textContent = conn.type;
          
          const relationDirection = document.createElement('span');
          relationDirection.className = 'relation-direction';
          relationDirection.textContent = conn.direction === 'source' ? ' → ' : ' ← ';
          
          const nodeName = document.createElement('span');
          nodeName.className = 'node-name';
          nodeName.textContent = connNode.label || connNode.name || connNode.id.split('.').pop();
          
          // Make the connection clickable to navigate to that node
          listItem.appendChild(relationType);
          listItem.appendChild(relationDirection);
          listItem.appendChild(nodeName);
          
          listItem.addEventListener('click', () => {
            // Find and click the connected node in the visualization
            const connectedNodeElement = gContainer.select(`.node[data-id="${connNode.id}"]`).node();
            if (connectedNodeElement) {
              nodeClicked({ currentTarget: connectedNodeElement }, connNode);
            }
          });
          
          connectedList.appendChild(listItem);
        }
      });
      
      detailContent.appendChild(connectedList);
    } else {
      const noConnections = document.createElement('p');
      noConnections.textContent = 'No related nodes found.';
      detailContent.appendChild(noConnections);
    }
  }
  
  // Find connected nodes (both incoming and outgoing)
  function findConnectedNodes(nodeId) {
    const connected = [];
    
    // Check all links
    gContainer.selectAll('.link').each(function(d) {
      const sourceId = typeof d.source === 'object' ? d.source.id : d.source;
      const targetId = typeof d.target === 'object' ? d.target.id : d.target;
      
      // If this node is the source
      if (sourceId === nodeId) {
        connected.push({
          id: targetId,
          type: d.type,
          direction: 'source' // This node is the source
        });
      }
      
      // If this node is the target
      if (targetId === nodeId) {
        connected.push({
          id: sourceId,
          type: d.type,
          direction: 'target' // This node is the target
        });
      }
    });
    
    return connected;
  }
  
  // Handle node click event
  function nodeClicked(event, d) {
    console.log("Node clicked:", d.id, d.group);
    
    // Clear previous selection
    gContainer.selectAll('.node.selected').classed('selected', false);
    
    // Mark this node as selected
    d3.select(event.currentTarget).classed('selected', true);
    selectedNode = d;
    
    // Highlight connected nodes and links
    highlightNodeConnections(d.id);
    
    // Show node details panel
    showNodeDetails(d);
    
    // Activate details panel
    const detailPanel = document.getElementById('detail-panel');
    if (detailPanel) {
      detailPanel.classList.add('active');
    }
    
    // Prevent event bubbling
    event.stopPropagation();
  }
  
  // Handle node mouse over event
  function nodeMouseOver(event, d) {
    console.log("Node mouseover:", d.id);
    
    // Show tooltip
    const tooltip = document.getElementById('tooltip');
    if (tooltip) {
      tooltip.style.opacity = 1;
      tooltip.style.left = (event.pageX + 10) + 'px';
      tooltip.style.top = (event.pageY - 10) + 'px';
      
      const tooltipTitle = document.getElementById('tooltip-title');
      const tooltipType = document.getElementById('tooltip-type');
      const tooltipUsed = document.getElementById('tooltip-used');
      
      if (tooltipTitle) tooltipTitle.textContent = d.label || d.id;
      if (tooltipType) tooltipType.textContent = d.group.charAt(0).toUpperCase() + d.group.slice(1);
      if (tooltipUsed) tooltipUsed.textContent = d.used ? 'Yes' : 'No';
    }
    
    // Don't highlight connections on hover if a node is already selected
    if (!selectedNode) {
      d3.select(event.currentTarget).classed('hover', true);
    }
  }
  
  // Handle node mouse out event
  function nodeMouseOut(event, d) {
    console.log("Node mouseout:", d.id);
    
    // Hide tooltip
    const tooltip = document.getElementById('tooltip');
    if (tooltip) {
      tooltip.style.opacity = 0;
    }
    
    // Remove hover class
    d3.select(event.currentTarget).classed('hover', false);
  }
  
  // Add CSS styles for proper visualization
  function addStyles() {
    const styleElement = document.createElement('style');
    
    styleElement.textContent = `
      /* Node styling */
      .node circle {
        stroke: #fff;
        stroke-width: 1.5px;
      }
      
      .node.selected circle {
        stroke: #ff0;
        stroke-width: 3px;
      }
      
      .node.hover circle {
        stroke: #f80;
        stroke-width: 2px;
      }
      
      .node text {
        font-family: sans-serif;
        font-size: 10px;
        pointer-events: none;
        text-shadow: 0 1px 0 #000, 1px 0 0 #000, 0 -1px 0 #000, -1px 0 0 #000;
        fill: white;
      }
      
      /* Link styling */
      .link {
        stroke-opacity: 0.6;
      }
      
      /* Highlighting */
      .node.highlighted circle {
        stroke: #ff0;
        stroke-width: 3px;
      }
      
      .node.connected circle {
        stroke: #f80;
        stroke-width: 2px;
      }
      
      .node.faded {
        opacity: 0.3;
      }
      
      .link.faded {
        opacity: 0.1;
      }
      
      .link.highlighted {
        stroke-width: 3px;
        stroke-opacity: 1;
      }
      
      /* Detail panel additional styling */
      .node-info {
        margin-bottom: 20px;
        border: 1px solid #ddd;
        padding: 10px;
        border-radius: 4px;
        background: #f8f8f8;
      }
      
      .info-item {
        margin: 5px 0;
        display: flex;
        align-items: center;
      }
      
      .info-label {
        font-weight: bold;
        width: 80px;
        color: #555;
      }
      
      .info-value {
        flex: 1;
      }
      
      .connected-list {
        list-style: none;
        padding: 0;
      }
      
      .connected-item {
        padding: 8px;
        margin: 5px 0;
        border-radius: 4px;
        background: #f5f5f5;
        cursor: pointer;
        transition: background 0.2s;
      }
      
      .connected-item:hover {
        background: #e0e0e0;
      }
      
      .relation-type {
        font-weight: bold;
        margin-right: 5px;
        color: #666;
      }
      
      .node-name {
        color: #333;
      }
      
      .used {
        color: var(--used-color);
      }
      
      .unused {
        color: var(--unused-color);
      }
    `;
    
    document.head.appendChild(styleElement);
  }
  
  // Initialize the visualization
  initVisualization();
  addStyles();
});

// Add direct filter event listeners
document.addEventListener('DOMContentLoaded', function() {
  console.log("Setting up additional filter event listeners");
  
  // Node type filters
  document.querySelectorAll('.node-filter').forEach(filter => {
    filter.addEventListener('change', () => {
      console.log('Node filter changed:', filter.value, filter.checked);
      applyFilters();
    });
  });
  
  // Link type filters
  document.querySelectorAll('.link-filter').forEach(filter => {
    filter.addEventListener('change', () => {
      console.log('Link filter changed:', filter.value, filter.checked);
      applyFilters();
    });
  });
  
  // Usage filters
  document.querySelectorAll('.usage-filter').forEach(filter => {
    filter.addEventListener('change', () => {
      console.log('Usage filter changed:', filter.value, filter.checked);
      applyFilters();
    });
  });
  
  // Library filters
  document.querySelectorAll('.library-filter').forEach(filter => {
    filter.addEventListener('change', () => {
      console.log('Library filter changed:', filter.value, filter.checked);
      applyFilters();
    });
  });
  
  console.log("Additional event listeners setup complete");
});
