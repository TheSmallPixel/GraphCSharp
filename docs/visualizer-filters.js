/**
 * Graph Filtering Module
 * Handles all filtering and search functionality including:
 * - Node type filtering
 * - Namespace filtering
 * - Usage state filtering
 * - Search functionality
 */

// Filter state variables
let activeFilters = {
  nodeTypes: new Set(['namespace', 'class', 'method', 'property']),
  namespaces: new Set(),
  showUnused: true,
  showExternal: true
};
let searchQuery = '';

/**
 * Initialize filters in the UI
 */
function initializeFilters() {
  console.log("Initializing filters...");
  
  // Set up node type filters
  setupNodeTypeFilters();
  
  // Set up namespace filters
  setupNamespaceFilters();
  
  // Set up usage filters
  setupUsageFilters();
  
  // Set up search functionality
  setupSearch();
  
  // Set up filter reset button
  document.getElementById('reset-filters').addEventListener('click', resetAllFilters);
  
  console.log("Filters initialized");
}

/**
 * Set up node type filter checkboxes
 */
function setupNodeTypeFilters() {
  // Node type filter checkboxes
  const typeCheckboxes = document.querySelectorAll('.node-type-filter');
  
  typeCheckboxes.forEach(checkbox => {
    // Add initial values to filter set
    if (checkbox.checked) {
      activeFilters.nodeTypes.add(checkbox.value);
    }
    
    // Add event listener for changes
    checkbox.addEventListener('change', function() {
      if (this.checked) {
        activeFilters.nodeTypes.add(this.value);
      } else {
        activeFilters.nodeTypes.delete(this.value);
      }
      
      applyFilters();
    });
  });
}

/**
 * Set up namespace filter checkboxes
 */
function setupNamespaceFilters() {
  // Get namespace container
  const namespaceContainer = document.getElementById('namespace-filters');
  
  // Clear any existing content
  namespaceContainer.innerHTML = '';
  
  // Add "Select All" option
  const selectAllDiv = document.createElement('div');
  selectAllDiv.className = 'filter-item select-all';
  
  const selectAllLabel = document.createElement('label');
  const selectAllCheckbox = document.createElement('input');
  selectAllCheckbox.type = 'checkbox';
  selectAllCheckbox.checked = true;
  selectAllCheckbox.id = 'select-all-namespaces';
  
  selectAllLabel.appendChild(selectAllCheckbox);
  selectAllLabel.appendChild(document.createTextNode('Select All Namespaces'));
  selectAllDiv.appendChild(selectAllLabel);
  namespaceContainer.appendChild(selectAllDiv);
  
  // Get list of namespaces
  const namespacesList = getNamespacesList();
  
  // Initialize all namespaces as active
  namespacesList.forEach(namespace => {
    activeFilters.namespaces.add(namespace);
  });
  
  // Add checkbox for each namespace
  namespacesList.forEach(namespace => {
    const div = document.createElement('div');
    div.className = 'filter-item';
    
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = namespace;
    checkbox.checked = true;
    
    // Create color indicator
    const colorIndicator = document.createElement('span');
    colorIndicator.className = 'color-indicator';
    colorIndicator.style.backgroundColor = 'var(--namespace-color)';
    
    // Display only the last part of the namespace
    const displayName = namespace.split('.').pop();
    
    label.appendChild(checkbox);
    label.appendChild(colorIndicator);
    label.appendChild(document.createTextNode(displayName));
    
    div.appendChild(label);
    namespaceContainer.appendChild(div);
    
    // Add event listener
    checkbox.addEventListener('change', function() {
      if (this.checked) {
        activeFilters.namespaces.add(namespace);
      } else {
        activeFilters.namespaces.delete(namespace);
      }
      
      // Update select all checkbox
      updateSelectAllCheckbox();
      
      // Apply filters
      applyFilters();
    });
  });
  
  // Select All checkbox event listener
  selectAllCheckbox.addEventListener('change', function() {
    const namespaceCheckboxes = namespaceContainer.querySelectorAll('input[type="checkbox"]:not(#select-all-namespaces)');
    
    if (this.checked) {
      // Select all namespaces
      namespaceCheckboxes.forEach(cb => {
        cb.checked = true;
        activeFilters.namespaces.add(cb.value);
      });
    } else {
      // Unselect all namespaces
      namespaceCheckboxes.forEach(cb => {
        cb.checked = false;
        activeFilters.namespaces.delete(cb.value);
      });
    }
    
    applyFilters();
  });
}

/**
 * Update the "Select All" checkbox based on individual namespace checkboxes
 */
function updateSelectAllCheckbox() {
  const namespaceContainer = document.getElementById('namespace-filters');
  const allNamespaceCheckboxes = namespaceContainer.querySelectorAll('input[type="checkbox"]:not(#select-all-namespaces)');
  const selectAllCheckbox = document.getElementById('select-all-namespaces');
  
  const allChecked = Array.from(allNamespaceCheckboxes).every(cb => cb.checked);
  const noneChecked = Array.from(allNamespaceCheckboxes).every(cb => !cb.checked);
  
  selectAllCheckbox.checked = allChecked;
  selectAllCheckbox.indeterminate = !allChecked && !noneChecked;
}

/**
 * Set up usage filter checkboxes
 */
function setupUsageFilters() {
  // Used/Unused filter
  const unusedCheckbox = document.getElementById('show-unused');
  unusedCheckbox.checked = activeFilters.showUnused;
  
  unusedCheckbox.addEventListener('change', function() {
    activeFilters.showUnused = this.checked;
    applyFilters();
  });
  
  // External node filter
  const externalCheckbox = document.getElementById('show-external');
  externalCheckbox.checked = activeFilters.showExternal;
  
  externalCheckbox.addEventListener('change', function() {
    activeFilters.showExternal = this.checked;
    applyFilters();
  });
}

/**
 * Set up search functionality
 */
function setupSearch() {
  const searchInput = document.getElementById('search');
  
  searchInput.addEventListener('input', function() {
    searchQuery = this.value.trim();
    applyFilters();
  });
  
  searchInput.addEventListener('keydown', function(event) {
    if (event.key === 'Enter' && searchQuery !== '') {
      // Find nodes matching the search
      const matchingNodes = searchNodes(searchQuery);
      
      if (matchingNodes.length > 0) {
        // Highlight and zoom to the first matching node
        highlightNode(matchingNodes[0]);
        zoomToNode(matchingNodes[0]);
      }
    }
  });
}

/**
 * Apply all active filters to the graph
 */
function applyFilters() {
  console.log("Applying filters...");
  
  // If no search, no node types, and no namespaces are selected, everything should be hidden
  const noNodesVisible = activeFilters.nodeTypes.size === 0 || activeFilters.namespaces.size === 0;
  
  // Get all nodes and links
  const nodes = gContainer.selectAll('.node');
  const links = gContainer.selectAll('.link');
  
  // Apply node type, namespace, and usage filters
  nodes.classed('filtered-out', d => {
    if (noNodesVisible) return true;
    
    // Check if node matches all filter criteria
    const matchesType = activeFilters.nodeTypes.has(d.group);
    
    // Check namespace
    let matchesNamespace = false;
    if (d.group === 'namespace') {
      matchesNamespace = activeFilters.namespaces.has(d.id);
    } else if (d.id.includes('.')) {
      const namespaceParts = d.id.split('.');
      if (namespaceParts.length > 1) {
        const nodeNamespace = namespaceParts.slice(0, -1).join('.');
        matchesNamespace = activeFilters.namespaces.has(nodeNamespace);
      }
    }
    
    // Check usage status
    const matchesUsage = d.used || activeFilters.showUnused;
    
    // Check external status
    const matchesExternal = !d.isexternal || activeFilters.showExternal;
    
    // Check search query
    const matchesSearch = searchQuery === '' || 
                         (d.id && d.id.toLowerCase().includes(searchQuery.toLowerCase())) ||
                         (d.label && d.label.toLowerCase().includes(searchQuery.toLowerCase())) ||
                         (d.name && d.name.toLowerCase().includes(searchQuery.toLowerCase()));
    
    return !(matchesType && matchesNamespace && matchesUsage && matchesExternal && matchesSearch);
  });
  
  // Update link visibility based on connected nodes
  links.classed('filtered-out', d => {
    const sourceId = typeof d.source === 'object' ? d.source.id : d.source;
    const targetId = typeof d.target === 'object' ? d.target.id : d.target;
    
    const sourceNode = gContainer.select(`.node[data-id="${sourceId}"]`);
    const targetNode = gContainer.select(`.node[data-id="${targetId}"]`);
    
    // If either source or target node is filtered out, hide the link
    return sourceNode.classed('filtered-out') || targetNode.classed('filtered-out');
  });
  
  console.log("Filters applied");
}

/**
 * Reset all filters to their default state
 */
function resetAllFilters() {
  console.log("Resetting all filters...");
  
  // Reset node type filters
  activeFilters.nodeTypes = new Set(['namespace', 'class', 'method', 'property']);
  
  document.querySelectorAll('.node-type-filter').forEach(checkbox => {
    checkbox.checked = true;
  });
  
  // Reset namespace filters (select all)
  const namespacesList = getNamespacesList();
  activeFilters.namespaces = new Set(namespacesList);
  
  document.querySelectorAll('#namespace-filters input[type="checkbox"]').forEach(checkbox => {
    checkbox.checked = true;
  });
  
  // Reset usage and external filters
  activeFilters.showUnused = true;
  activeFilters.showExternal = true;
  
  document.getElementById('show-unused').checked = true;
  document.getElementById('show-external').checked = true;
  
  // Reset search
  searchQuery = '';
  document.getElementById('search').value = '';
  
  // Apply the reset filters
  applyFilters();
  
  console.log("Filters reset to default");
}
