// Enhanced C# Code Graph Visualizer
document.addEventListener('DOMContentLoaded', function() {
  let graph = null; // Will hold our graph data
  let simulation = null; // Force simulation
  let svg = null;
  let gContainer = null;
  let zoomBehavior = null;
  
  // DOM elements
  const chartContainer = document.getElementById('chart');
  const tooltip = document.getElementById('tooltip');
  const detailPanel = document.getElementById('detail-panel');
  const loadingOverlay = document.getElementById('loading-overlay');
  const filterContainer = document.getElementById('filters');
  
  // Track current visualization state
  let currentLayout = 'force'; // 'force' or 'hierarchical'
  let highlightUnused = false;
  let selectedNode = null;
  
  // Store processed data for analysis
  let unusedElements = new Set();
  let nodeUsageCounts = new Map();
  let nodeReferences = new Map(); // Maps node IDs to their incoming/outgoing references
  
  // Initialize the visualization
  function init() {
    // Load data and set up the visualization
    loadGraph();
  }
  
  // Set up the visualization after data is loaded
  function setupVisualization() {
    // Process data
    processData();
    
    // Calculate stats
    updateStats();
    
    // Draw graph
    drawGraph();
    
    // Set up event listeners
    setupEventListeners();
  }
  
  // Load graph data
  function loadGraph() {
    d3.json('graph.json').then(data => {
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
        
        console.log(`Node ${node.id}: isexternal=${node.isexternal} (type: ${typeof node.isexternal})`);
      });
      
      // Set up visualization
      setupVisualization();
    }).catch(error => {
      console.error('Error loading graph data:', error);
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
  
  // Draw the graph using D3
  function drawGraph() {
    // Clear previous visualization
    d3.select('#chart').html('');
    
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
    
    // Get element and window sizes
    const width = chartContainer.clientWidth;
    const height = chartContainer.clientHeight;
    
    // Create color scales
    const colorMap = {
      namespace: getComputedStyle(document.documentElement).getPropertyValue('--namespace-color'),
      class: getComputedStyle(document.documentElement).getPropertyValue('--class-color'),
      method: getComputedStyle(document.documentElement).getPropertyValue('--method-color'),
      property: getComputedStyle(document.documentElement).getPropertyValue('--property-color'),
      variable: getComputedStyle(document.documentElement).getPropertyValue('--variable-color'),
      type: getComputedStyle(document.documentElement).getPropertyValue('--type-color')
    };
    
    // Create a custom boundary force
    function forceBoundary(alpha) {
      const centerX = width / 2;
      const centerY = height / 2;
      const radius = Math.min(width, height) / 2 - 50; // Boundary radius

      for (let i = 0, n = graph.nodes.length; i < n; ++i) {
        const node = graph.nodes[i];
        // Calculate distance from center
        const dx = node.x - centerX;
        const dy = node.y - centerY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // If node is outside boundary, push it back
        if (distance > radius) {
          const k = (distance - radius) / distance * alpha;
          node.x -= dx * k;
          node.y -= dy * k;
        }
      }
    }
    
    // Initialize the force simulation
    simulation = d3.forceSimulation(graph.nodes)
      .force('link', d3.forceLink(graph.links)
        .id(d => d.id)
        .distance(d => {
          // Adjust link distance based on node types
          if (d.type === 'containment') return 80;
          if (d.type === 'reference') return 120;
          return 100;
        })
        .strength(d => {
          if (d.type === 'reference') return 0.2;
          if (d.type === 'external') return 0.1;
          return 0.5;
        })
      )
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(30))
      .force('boundary', forceBoundary); // Custom boundary force

    // Draw links
    const link = gContainer.selectAll('.link')
      .data(graph.links)
      .enter().append('line')
      .attr('class', 'link')
      .style('stroke', d => {
        switch(d.type) {
          case 'reference': return 'blue';
          case 'external': return 'red';
          case 'call': return '#555';
          default: return '#999';
        }
      })
      .style('stroke-width', 1.5)
      .style('stroke-dasharray', d => {
        return d.type === 'reference' || d.type === 'external' ? '3,3' : null;
      });
    
    // Draw nodes
    const node = gContainer.selectAll('.node')
      .data(graph.nodes)
      .enter().append('g')
      .attr('class', d => `node ${d.used === false ? 'unused' : 'used'}`)
      .attr('data-id', d => d.id)
      .attr('data-group', d => d.group)
      .call(d3.drag()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended));
    
    // Add circles to nodes
    node.append('circle')
      .attr('r', d => {
        if (d.group === 'namespace') return 12;
        if (d.group === 'class') return 10;
        if (d.group === 'method') return 7;
        if (d.group === 'property') return 7;
        if (d.group === 'variable') return 5;
        return 6;
      })
      .attr('fill', getNodeColor)
      .attr('stroke', d => {
        // Add stroke for unused elements
        if (d.used === false) {
          return getComputedStyle(document.documentElement).getPropertyValue('--unused-color');
        }
        return '#fff';
      })
      .attr('stroke-width', d => d.used === false ? 2 : 1.5);
    
    // Add labels to nodes
    node.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '.35em')
      .attr('y', d => {
        // Position label below node for larger elements
        if (d.group === 'namespace' || d.group === 'class') return 20;
        return 15;
      })
      .text(d => d.label)
      .style('font-weight', d => d.group === 'namespace' || d.group === 'class' ? 'bold' : 'normal')
      .style('font-size', d => {
        if (d.group === 'namespace') return '12px';
        if (d.group === 'class') return '11px';
        return '10px';
      });
    
    // Add event listeners to nodes
    node
      .on('mouseover', handleNodeMouseOver)
      .on('mouseout', handleNodeMouseOut)
      .on('click', handleNodeClick);
    
    // Update simulation on tick
    simulation.on('tick', () => {
      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);
      
      node.attr('transform', d => `translate(${d.x}, ${d.y})`);
    });
    
    // Update node-link counter
    document.getElementById('node-link-counter').textContent = 
      `Nodes: ${graph.nodes.length} | Links: ${graph.links.length}`;
    
    // Apply current layout
    if (currentLayout === 'hierarchical') {
      switchToHierarchicalLayout();
    }
    
    // Reset zoom
    resetZoom();
  }
  
  // Function to get node color
  function getNodeColor(node) {
    // If node is not used, return red
    if (node.used === false) {
      return '#FF5252';
    }
    
    switch (node.group) {
      case 'namespace':
        return getComputedStyle(document.documentElement).getPropertyValue('--namespace-color');
      case 'class':
        return getComputedStyle(document.documentElement).getPropertyValue('--class-color');
      case 'method':
        return getComputedStyle(document.documentElement).getPropertyValue('--method-color');
      case 'property':
        return getComputedStyle(document.documentElement).getPropertyValue('--property-color');
      case 'variable':
        return getComputedStyle(document.documentElement).getPropertyValue('--variable-color');
      case 'type':
        return getComputedStyle(document.documentElement).getPropertyValue('--type-color');
      case 'external':
      case 'external-method':
      case 'external-property':
        return getComputedStyle(document.documentElement).getPropertyValue('--external-color');
      default:
        return '#999999';
    }
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
  
  // Handle node mouse over event
  function handleNodeMouseOver(event, d) {
    const node = d3.select(this);
    node.classed('highlight', true);
    
    // Show tooltip
    tooltip.style.opacity = 1;
    tooltip.style.left = (event.pageX + 10) + 'px';
    tooltip.style.top = (event.pageY - 10) + 'px';
    
    document.getElementById('tooltip-title').textContent = d.label;
    document.getElementById('tooltip-type').textContent = d.group.charAt(0).toUpperCase() + d.group.slice(1);
    document.getElementById('tooltip-used').textContent = d.used === false ? 'No' : 'Yes';
    
    // Highlight connected links and nodes
    highlightConnections(d.id);
  }
  
  // Handle node mouse out event
  function handleNodeMouseOut() {
    const node = d3.select(this);
    node.classed('highlight', false);
    
    // Hide tooltip
    tooltip.style.opacity = 0;
    
    // Remove highlights if no node is selected
    if (!selectedNode) {
      resetHighlights();
    }
  }
  
  // Handle node click event
  function handleNodeClick(event, d) {
    // Toggle selection
    if (selectedNode === d.id) {
      selectedNode = null;
      detailPanel.classList.remove('active');
      resetHighlights();
    } else {
      selectedNode = d.id;
      showNodeDetails(d);
      highlightConnections(d.id);
      detailPanel.classList.add('active');
    }
  }
  
  // Show detailed information about a node
  function showNodeDetails(node) {
    document.getElementById('detail-title').textContent = node.label;
    
    const contentEl = document.getElementById('detail-content');
    contentEl.innerHTML = '';
    
    // Basic information section
    const infoSection = document.createElement('div');
    infoSection.className = 'detail-section';
    
    const typeEl = document.createElement('p');
    typeEl.innerHTML = `<strong>Type:</strong> ${node.group.charAt(0).toUpperCase() + node.group.slice(1)}`;
    infoSection.appendChild(typeEl);
    
    const fullNameEl = document.createElement('p');
    fullNameEl.innerHTML = `<strong>Full Name:</strong> ${node.id}`;
    infoSection.appendChild(fullNameEl);
    
    // Add data type information for variables and properties
    if ((node.group === 'variable' || node.group === 'property') && node.type) {
      const dataTypeEl = document.createElement('p');
      dataTypeEl.innerHTML = `<strong>Data Type:</strong> <span class="data-type">${node.type}</span>`;
      infoSection.appendChild(dataTypeEl);
    }
    
    // Add file path and line number information if available
    // Note: JSON property names are lowercase due to LowercaseNamingStrategy
    if (node.filepath && node.linenumber > 0) {
      const locationEl = document.createElement('p');
      locationEl.innerHTML = `<strong>Location:</strong> ${node.filepath}:${node.linenumber}`;
      infoSection.appendChild(locationEl);
    }
    
    // Add origin information (internal/external)
    const originEl = document.createElement('p');
    originEl.innerHTML = `<strong>Origin:</strong> ${node.isexternal ? 'External Library' : 'Internal Code'}`;
    infoSection.appendChild(originEl);
    
    const usageCount = nodeUsageCounts.get(node.id) || 0;
    const usageEl = document.createElement('p');
    usageEl.innerHTML = `<strong>Usage Count:</strong> ${usageCount} 
      <span class="usage-status">(${node.used ? 'Used' : 'Unused'})</span>`;
    infoSection.appendChild(usageEl);
    
    contentEl.appendChild(infoSection);
    
    // Unused warning if applicable
    if (node.used === false) {
      const warningEl = document.createElement('div');
      warningEl.className = 'unused-warning';
      warningEl.innerHTML = `
        <i class="fas fa-exclamation-triangle"></i> 
        <strong>Warning:</strong> This ${node.group} appears to be unused in the codebase. 
        Consider removing it to improve code quality.
      `;
      contentEl.appendChild(warningEl);
    }
    
    // Relationships section
    const relationshipsSection = document.createElement('div');
    relationshipsSection.className = 'detail-section';
    
    // Incoming references (who uses this?)
    const incomingEl = document.createElement('div');
    incomingEl.innerHTML = '<h3>Incoming References</h3>';
    
    const incomingList = document.createElement('div');
    incomingList.className = 'relationship-list';
    
    const refs = nodeReferences.get(node.id);
    if (refs && refs.incoming.length > 0) {
      refs.incoming.forEach(ref => {
        const refNode = graph.nodes.find(n => n.id === ref.id);
        if (refNode) {
          const itemEl = document.createElement('div');
          itemEl.className = 'relationship-item';
          itemEl.setAttribute('data-id', refNode.id);
          itemEl.innerHTML = `
            <div class="relationship-icon">
              <i class="fas ${getIconForNodeType(refNode.group)}" 
                 style="color: ${getColorForNodeType(refNode.group)}"></i>
            </div>
            <div>${refNode.label} (${ref.type})</div>
          `;
          itemEl.addEventListener('click', () => {
            const clickedNode = graph.nodes.find(n => n.id === refNode.id);
            if (clickedNode) {
              selectedNode = clickedNode.id;
              showNodeDetails(clickedNode);
              highlightConnections(clickedNode.id);
              
              // Focus the node in the visualization
              focusNode(clickedNode);
            }
          });
          incomingList.appendChild(itemEl);
        }
      });
    } else {
      incomingList.innerHTML = '<div>No incoming references</div>';
    }
    
    incomingEl.appendChild(incomingList);
    relationshipsSection.appendChild(incomingEl);
    
    // Outgoing references (what does this use?)
    const outgoingEl = document.createElement('div');
    outgoingEl.innerHTML = '<h3>Outgoing References</h3>';
    
    const outgoingList = document.createElement('div');
    outgoingList.className = 'relationship-list';
    
    if (refs && refs.outgoing.length > 0) {
      refs.outgoing.forEach(ref => {
        const refNode = graph.nodes.find(n => n.id === ref.id);
        if (refNode) {
          const itemEl = document.createElement('div');
          itemEl.className = 'relationship-item';
          itemEl.setAttribute('data-id', refNode.id);
          itemEl.innerHTML = `
            <div class="relationship-icon">
              <i class="fas ${getIconForNodeType(refNode.group)}" 
                 style="color: ${getColorForNodeType(refNode.group)}"></i>
            </div>
            <div>${refNode.label} (${ref.type})</div>
          `;
          itemEl.addEventListener('click', () => {
            const clickedNode = graph.nodes.find(n => n.id === refNode.id);
            if (clickedNode) {
              selectedNode = clickedNode.id;
              showNodeDetails(clickedNode);
              highlightConnections(clickedNode.id);
              
              // Focus the node in the visualization
              focusNode(clickedNode);
            }
          });
          outgoingList.appendChild(itemEl);
        }
      });
    } else {
      outgoingList.innerHTML = '<div>No outgoing references</div>';
    }
    
    outgoingEl.appendChild(outgoingList);
    relationshipsSection.appendChild(outgoingEl);
    
    contentEl.appendChild(relationshipsSection);
  }

  // Focus on a specific node in the visualization
  function focusNode(node) {
    // Get the current transform
    const transform = d3.zoomTransform(svg.node());
    
    // Calculate new transform to center on the node
    const scale = 1.5;
    const x = -node.x * scale + chartContainer.clientWidth / 2;
    const y = -node.y * scale + chartContainer.clientHeight / 2;
    
    // Transition to the new transform
    svg.transition().duration(750)
      .call(zoomBehavior.transform, d3.zoomIdentity.translate(x, y).scale(scale));
    
    // Highlight the node
    d3.select(`.node[data-id="${node.id}"]`).classed('highlight', true);
  }
  
  // Highlight connections for a node
  function highlightConnections(nodeId) {
    // Reset previous highlights
    resetHighlights();
    
    // Fade all nodes and links
    gContainer.selectAll('.node').classed('faded', true);
    gContainer.selectAll('.link').classed('faded', true);
    
    // Highlight the selected node
    const selectedNodeEl = gContainer.select(`.node[data-id="${nodeId}"]`);
    selectedNodeEl.classed('faded', false).classed('highlight', true);
    
    // Find connected nodes
    const connectedNodeIds = new Set();
    connectedNodeIds.add(nodeId);
    
    // Add incoming and outgoing connections
    const refs = nodeReferences.get(nodeId);
    if (refs) {
      refs.incoming.forEach(ref => connectedNodeIds.add(ref.id));
      refs.outgoing.forEach(ref => connectedNodeIds.add(ref.id));
    }
    
    // Highlight connected nodes
    connectedNodeIds.forEach(id => {
      gContainer.select(`.node[data-id="${id}"]`).classed('faded', false);
    });
    
    // Highlight links between connected nodes
    gContainer.selectAll('.link').each(function(d) {
      if (connectedNodeIds.has(d.source.id || d.source) && 
          connectedNodeIds.has(d.target.id || d.target)) {
        d3.select(this).classed('faded', false).classed('highlight', true);
      }
    });
  }
  
  // Reset all highlights
  function resetHighlights() {
    gContainer.selectAll('.node').classed('faded', false).classed('highlight', false);
    gContainer.selectAll('.link').classed('faded', false).classed('highlight', false);
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
  
  // Setup event listeners for UI controls
  function setupEventListeners() {
    // Layout toggle buttons
    document.getElementById('toggle-hierarchical').addEventListener('click', () => {
      switchToHierarchicalLayout();
    });
    
    document.getElementById('toggle-force-directed').addEventListener('click', () => {
      switchToForceDirectedLayout();
    });
    
    // Unused elements toggle
    document.getElementById('toggle-highlight-unused').addEventListener('click', () => {
      highlightUnused = !highlightUnused;
      
      // Update the visualization
      gContainer.selectAll('.node circle')
        .transition().duration(500)
        .attr('fill', d => {
          if (highlightUnused && d.used === false) {
            return getComputedStyle(document.documentElement).getPropertyValue('--unused-color');
          }
          return getNodeColor(d);
        });
    });
    
    // Node filters
    document.querySelectorAll('.node-filter').forEach(filter => {
      filter.addEventListener('change', applyFilters);
    });
    
    // Link filters
    document.querySelectorAll('.link-filter').forEach(filter => {
      filter.addEventListener('change', filterLinks);
    });
    
    // Usage filters
    document.querySelectorAll('.usage-filter').forEach(filter => {
      filter.addEventListener('change', applyFilters);
    });
    
    // Library filters
    document.querySelectorAll('.library-filter').forEach(filter => {
      filter.addEventListener('change', applyFilters);
    });
    
    // Search
    document.getElementById('search').addEventListener('input', handleSearch);
    
    // Zoom controls
    document.getElementById('zoom-in').addEventListener('click', () => {
      svg.transition().duration(300)
        .call(zoomBehavior.scaleBy, 1.5);
    });
    
    document.getElementById('zoom-out').addEventListener('click', () => {
      svg.transition().duration(300)
        .call(zoomBehavior.scaleBy, 0.66);
    });
    
    document.getElementById('zoom-reset').addEventListener('click', resetZoom);
    
    // Detail panel close button
    document.getElementById('close-details').addEventListener('click', () => {
      detailPanel.classList.remove('active');
      selectedNode = null;
      resetHighlights();
    });
    
    // Initial call to apply filters
    applyFilters();
  }
  
  // Apply all filters
  function applyFilters() {
    // Get selected node types
    const selectedGroups = [];
    document.querySelectorAll('.node-filter:checked').forEach(filter => {
      selectedGroups.push(filter.value);
    });
    
    // Get usage filter state
    const showUsed = document.querySelector('.usage-filter[value="used"]').checked;
    const showUnused = document.querySelector('.usage-filter[value="unused"]').checked;
    
    // Get library filter state
    const showInternal = document.getElementById('filter-internal').checked;
    const showExternal = document.getElementById('filter-external').checked;
    
    console.log("Filters:", { selectedGroups, showUsed, showUnused, showInternal, showExternal });
    
    // Apply all filters together
    gContainer.selectAll('.node')
      .style('display', function(d) {
        // Type filter
        if (!selectedGroups.includes(d.group)) {
          console.log(`Node ${d.id} hidden: group ${d.group} not in selected groups`);
          return 'none';
        }
        
        // Usage filter
        if (d.used && !showUsed) {
          console.log(`Node ${d.id} hidden: used but showUsed is false`);
          return 'none';
        }
        if (!d.used && !showUnused) {
          console.log(`Node ${d.id} hidden: unused but showUnused is false`);
          return 'none';
        }
        
        // Library filter - debugging to find the issue
        console.log(`Checking external for ${d.id}: isexternal=${d.isexternal}, showExternal=${showExternal}, showInternal=${showInternal}`);
        
        if (d.isexternal && !showExternal) {
          console.log(`Node ${d.id} hidden: external library`);
          return 'none';
        }
        if (!d.isexternal && !showInternal) {
          console.log(`Node ${d.id} hidden: internal code`);
          return 'none';
        }
        
        console.log(`Node ${d.id} visible`);
        return 'block';
      });
    
    // Update links
    filterLinksForHiddenNodes();
  }
  
  // Filter links based on type
  function filterLinks() {
    const selectedTypes = Array.from(document.querySelectorAll('.link-filter:checked'))
      .map(checkbox => checkbox.value);
    
    gContainer.selectAll('.link')
      .style('display', d => {
        return selectedTypes.includes(d.type) ? 'block' : 'none';
      });
  }
  
  // Filter links connected to hidden nodes
  function filterLinksForHiddenNodes() {
    gContainer.selectAll('.link')
      .style('display', function(d) {
        // Get source and target nodes
        const sourceNode = gContainer.select(`.node[data-id="${d.source.id || d.source}"]`);
        const targetNode = gContainer.select(`.node[data-id="${d.target.id || d.target}"]`);
        
        // Check if either end is hidden
        const sourceDisplay = sourceNode.style('display');
        const targetDisplay = targetNode.style('display');
        
        if (sourceDisplay === 'none' || targetDisplay === 'none') {
          return 'none';
        }
        
        return null; // Use the current display value based on link type filters
      });
  }
  
  // Handle search input
  function handleSearch() {
    const searchTerm = document.getElementById('search').value.toLowerCase();
    
    if (!searchTerm) {
      // Reset all nodes and links to their filtered state
      applyFilters();
      filterLinks();
      return;
    }
    
    // Apply search filter
    gContainer.selectAll('.node')
      .style('display', d => {
        // First apply regular filters
        if (!d.id.toLowerCase().includes(searchTerm) && 
            !d.label.toLowerCase().includes(searchTerm)) {
          return 'none';
        }
        // Otherwise, show if it passes regular filters
        return null;
      });
    
    // Update links for visible nodes
    filterLinksForHiddenNodes();
  }
  
  // Update node stats
  function updateStats() {
    loadingOverlay.style.display = 'flex';
    
    setTimeout(() => {
      const stats = calculateStats();
      document.getElementById('namespace-count').textContent = stats.namespaces;
      document.getElementById('class-count').textContent = stats.classes;
      document.getElementById('method-count').textContent = stats.methods;
      document.getElementById('property-count').textContent = stats.properties;
      document.getElementById('unused-count').textContent = stats.unused;
      
      loadingOverlay.style.display = 'none';
    }, 0);
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
    if (currentLayout === 'force') {
      d.fx = null;
      d.fy = null;
    }
  }
  
  // Hide loading overlay
  function hideLoading() {
    loadingOverlay.style.display = 'none';
  }
  
  // Initialize the visualization
  init();
});
