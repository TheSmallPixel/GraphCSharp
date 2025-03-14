/**
 * Graph UI Interaction Module
 * Handles all UI interactions including:
 * - Node event handling (click, hover)
 * - Detail panel functionality
 * - Tooltip management
 * - Context menu
 */

// UI element references (now declared in visualizer-main.js)
/*
let chartContainer;
let detailPanel;
let tooltip;
let filterContainer;
let loadingOverlay;
*/

// State tracking
let selectedNode = null;
let highlightedNode = null;

/**
 * Node mouse over event handler
 */
function nodeMouseOver(event, d) {
  // Highlight the node
  d3.select(this).classed('hover', true);
  
  // Show tooltip
  showTooltip(event, d);
  
  // Highlight connected nodes and links
  highlightConnections(d, true);
}

/**
 * Node mouse out event handler
 */
function nodeMouseOut(event, d) {
  // Remove highlight from the node
  d3.select(this).classed('hover', false);
  
  // Hide tooltip
  hideTooltip();
  
  // Reset highlighted connections if this node isn't selected
  if (!selectedNode || selectedNode.id !== d.id) {
    highlightConnections(d, false);
  }
}

/**
 * Node click event handler
 */
function nodeClicked(event, d) {
  console.log(`Node clicked: ${d.id} (${d.group})`);
  
  // Clear previous selection
  if (selectedNode) {
    gContainer.selectAll('.node').classed('selected', false);
    
    // Reset connections if the previous selected node is different
    if (selectedNode.id !== d.id) {
      highlightConnections(selectedNode, false);
    }
  }
  
  // Select this node
  selectedNode = d;
  d3.select(this).classed('selected', true);
  
  // Highlight connections
  highlightConnections(d, true);
  
  // Show detail panel
  showDetailPanel(d);
  
  // Prevent event bubbling
  event.stopPropagation();
}

/**
 * Clear all selections and highlights
 */
function clearSelection() {
  console.log("Clearing selection");
  
  // Reset selected node
  selectedNode = null;
  
  // Remove all highlighting
  gContainer.selectAll('.node').classed('selected', false).classed('highlighted', false).classed('connected', false);
  gContainer.selectAll('.link').classed('highlighted', false);
  
  // Hide detail panel
  hideDetailPanel();
}

/**
 * Highlight connections for a node
 */
function highlightConnections(node, shouldHighlight) {
  if (!node) return;
  
  // Get source and target IDs for each link to check connections
  const links = gContainer.selectAll('.link');
  
  links.each(function(link) {
    const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
    const targetId = typeof link.target === 'object' ? link.target.id : link.target;
    
    // Check if this link connects to the node
    const isConnected = sourceId === node.id || targetId === node.id;
    
    // Apply or remove highlight based on connection
    d3.select(this).classed('highlighted', shouldHighlight && isConnected);
    
    // If connected, also highlight the connected node
    if (isConnected && shouldHighlight) {
      const connectedNodeId = sourceId === node.id ? targetId : sourceId;
      gContainer.select(`.node[data-id="${connectedNodeId}"]`).classed('connected', true);
    } else if (isConnected && !shouldHighlight) {
      const connectedNodeId = sourceId === node.id ? targetId : sourceId;
      gContainer.select(`.node[data-id="${connectedNodeId}"]`).classed('connected', false);
    }
  });
  
  // Highlight or unhighlight the current node
  gContainer.select(`.node[data-id="${node.id}"]`).classed('highlighted', shouldHighlight);
}

/**
 * Show tooltip for a node
 */
function showTooltip(event, d) {
  // If tooltip element doesn't exist, create it
  if (!tooltip) {
    tooltip = d3.select('body').append('div')
      .attr('id', 'tooltip')
      .style('opacity', 0);
  }
  
  // Get node usage count
  const usageCount = getNodeUsageCount(d.id);
  
  // Create tooltip content
  const content = `
    <div id="tooltip-title">${d.label || d.name || d.id}</div>
    <div class="tooltip-info">
      <span>Type: ${d.group}</span>
      <span>Used: ${d.used ? 'Yes' : 'No'}</span>
    </div>
    <div class="tooltip-info">
      <span>References: ${usageCount}</span>
      ${d.isexternal ? '<span>External</span>' : ''}
    </div>
  `;
  
  // Position and show tooltip
  tooltip.html(content)
    .style('left', (event.pageX + 15) + 'px')
    .style('top', (event.pageY - 28) + 'px')
    .style('display', 'block')
    .transition()
    .duration(200)
    .style('opacity', 1);
}

/**
 * Hide the tooltip
 */
function hideTooltip() {
  if (tooltip) {
    tooltip.transition()
      .duration(200)
      .style('opacity', 0)
      .on('end', function() {
        d3.select(this).style('display', 'none');
      });
  }
}

/**
 * Show the detail panel for a node
 */
function showDetailPanel(node) {
  console.log(`Showing detail panel for ${node.id}`);
  
  // If detail panel element doesn't exist, return
  if (!detailPanel) return;
  
  // Get node relationships
  const relationships = getNodeRelationships(node.id);
  const usageCount = getNodeUsageCount(node.id);
  
  // Create the header with node info
  let panelContent = `
    <div id="detail-header">
      <h3 id="detail-title">${node.label || node.name || node.id.split('.').pop()}</h3>
      <button id="detail-close"><i class="fas fa-times"></i></button>
    </div>
    <div id="detail-content">
      <div class="detail-info">
        <dl>
          <dt>Full ID:</dt>
          <dd>${node.id}</dd>
          <dt>Type:</dt>
          <dd><span class="color-indicator" style="background-color: ${getNodeColor(node)}"></span>${node.group}</dd>
          <dt>Usage Count:</dt>
          <dd>${usageCount} reference${usageCount !== 1 ? 's' : ''}</dd>
        </dl>
      </div>
  `;
  
  // Add unused warning if applicable
  if (!node.used) {
    panelContent += `
      <div class="unused-warning">
        <i class="fas fa-exclamation-triangle"></i> This ${node.group} appears to be unused in the codebase.
      </div>
    `;
  }
  
  // Add relationships section
  panelContent += `<div id="related-nodes"><h3>Relationships</h3>`;
  
  // Show inbound relationships (uses this node)
  if (relationships.inbound.length > 0) {
    panelContent += `<h4>Used by (${relationships.inbound.length}):</h4><div class="relationship-list">`;
    
    relationships.inbound.forEach(rel => {
      const relNode = nodeMap.get(rel.nodeId);
      if (!relNode) return;
      
      panelContent += `
        <div class="related-node" data-id="${relNode.id}">
          <span class="node-icon" style="background-color: ${getNodeColor(relNode)}"></span>
          <span class="relation-type">${relNode.group}</span>
          <span class="relation-direction"><i class="fas fa-arrow-right"></i></span>
          <span class="relation-name">${relNode.label || relNode.name || relNode.id.split('.').pop()}</span>
        </div>
      `;
    });
    
    panelContent += `</div>`;
  } else {
    panelContent += `<h4>Used by: None</h4>`;
  }
  
  // Show outbound relationships (node uses these)
  if (relationships.outbound.length > 0) {
    panelContent += `<h4>Uses (${relationships.outbound.length}):</h4><div class="relationship-list">`;
    
    relationships.outbound.forEach(rel => {
      const relNode = nodeMap.get(rel.nodeId);
      if (!relNode) return;
      
      panelContent += `
        <div class="related-node" data-id="${relNode.id}">
          <span class="node-icon" style="background-color: ${getNodeColor(relNode)}"></span>
          <span class="relation-type">${relNode.group}</span>
          <span class="relation-direction"><i class="fas fa-arrow-right"></i></span>
          <span class="relation-name">${relNode.label || relNode.name || relNode.id.split('.').pop()}</span>
        </div>
      `;
    });
    
    panelContent += `</div>`;
  } else {
    panelContent += `<h4>Uses: None</h4>`;
  }
  
  panelContent += `</div></div>`;
  
  // Set panel content and show it
  detailPanel.innerHTML = panelContent;
  detailPanel.style.display = 'block';
  
  // Add click handler for close button
  document.getElementById('detail-close').addEventListener('click', hideDetailPanel);
  
  // Add click handlers for related nodes
  const relatedNodeElements = document.querySelectorAll('.related-node');
  relatedNodeElements.forEach(element => {
    element.addEventListener('click', function() {
      const nodeId = this.getAttribute('data-id');
      const node = nodeMap.get(nodeId);
      
      if (node) {
        // Find the node in the visualization
        const nodeElement = gContainer.select(`.node[data-id="${nodeId}"]`).node();
        
        if (nodeElement) {
          // Simulate click on the node
          const nodeData = d3.select(nodeElement).datum();
          nodeClicked.call(nodeElement, {stopPropagation: () => {}}, nodeData);
          
          // Zoom to the node
          zoomToNode(nodeData);
        }
      }
    });
  });
}

/**
 * Hide the detail panel
 */
function hideDetailPanel() {
  if (detailPanel) {
    detailPanel.style.display = 'none';
  }
}

/**
 * Highlight a specific node by ID
 */
function highlightNode(node) {
  // Clear any existing selection
  clearSelection();
  
  // Find the node element
  const nodeElement = gContainer.select(`.node[data-id="${node.id}"]`);
  
  if (!nodeElement.empty()) {
    // Make sure the node is visible (not filtered out)
    nodeElement.classed('filtered-out', false);
    
    // Highlight the node
    nodeElement.classed('highlight', true);
    
    // Select the node
    selectedNode = node;
    nodeElement.classed('selected', true);
    
    // Highlight connections
    highlightConnections(node, true);
    
    // Show detail panel
    showDetailPanel(node);
  }
}

/**
 * Setup background click to clear selection
 */
function setupBackgroundClick() {
  svg.on('click', function(event) {
    // Only handle clicks directly on the SVG, not on nodes
    if (event.target === svg.node() || event.target === document.querySelector('svg rect')) {
      clearSelection();
    }
  });
}
