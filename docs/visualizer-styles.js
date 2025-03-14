/**
 * Graph Styling Module
 * Handles the visual appearance of nodes and links including:
 * - Node colors
 * - Node sizes
 * - Link colors
 * - Link styles
 */

/**
 * Get the color for a node based on its type and state
 */
function getNodeColor(node) {
  // If node is external, use external color
  if (node.isexternal) {
    return 'var(--external-color)';
  }
  
  // Color by node type
  switch (node.group) {
    case 'namespace':
      return 'var(--namespace-color)';
    case 'class':
      return 'var(--class-color)';
    case 'method':
      return 'var(--method-color)';
    case 'property':
      return 'var(--property-color)';
    case 'variable':
      return 'var(--variable-color)';
    default:
      return 'var(--type-color)';
  }
}

/**
 * Get the radius for a node based on its type and usage
 */
function getNodeRadius(node) {
  // Base radius
  let radius = 5;
  
  // Adjust radius by node type
  switch (node.group) {
    case 'namespace':
      radius = 10;
      break;
    case 'class':
      radius = 8;
      break;
    case 'method':
      radius = 5;
      break;
    case 'property':
      radius = 4;
      break;
    default:
      radius = 5;
  }
  
  // Adjust radius by usage count
  const usageCount = getNodeUsageCount(node.id);
  if (usageCount > 10) {
    radius += 2;
  } else if (usageCount > 5) {
    radius += 1;
  }
  
  return radius;
}

/**
 * Get the color for a link
 */
function getLinkColor(link) {
  switch (link.type) {
    case 'implements':
      return '#2ecc71'; // Green
    case 'extends':
      return '#e74c3c'; // Red
    case 'uses':
      return '#3498db'; // Blue
    case 'contains':
      return '#9b59b6'; // Purple
    default:
      return 'var(--link-color)';
  }
}

/**
 * Add custom CSS styles programmatically
 */
function addStyles() {
  const styleElement = document.createElement('style');
  styleElement.textContent = `
    /* Node filter styling */
    .node.filtered-out {
      display: none;
    }
    
    /* Link filter styling */
    .link.filtered-out {
      display: none;
    }
    
    /* Node highlighting */
    .node.highlight circle {
      stroke: #ffd700;
      stroke-width: 2.5px;
    }
    
    /* Add style for faded nodes during highlighting */
    .node.faded {
      opacity: 0.3;
    }
    
    /* Link highlighting */
    .link.highlight {
      stroke-width: 2px !important;
      stroke-opacity: 1 !important;
    }
    
    /* Link fading */
    .link.faded {
      opacity: 0.1;
    }
  `;
  
  document.head.appendChild(styleElement);
}
