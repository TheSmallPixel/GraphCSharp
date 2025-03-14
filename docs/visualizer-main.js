/**
 * Main entry point for the C# Code Graph Visualizer
 * This file loads all the required modules in the correct order
 */

// Global graph data
let graph = { nodes: [], links: [] };
let graphData = {};
let nodeMap = new Map();
let nodeUsageCounts = new Map();
let nodeRelationships = new Map();
let namespaces = new Set();

// Module references
let chartContainer;
let detailPanel;
let loadingOverlay;
let tooltip;
let filterContainer;

// Global variables for visualization
let svg;
let gContainer;
let zoomBehavior;
let simulation;
let currentLayout = 'force';

// Load the visualization modules sequentially with dynamic imports
document.addEventListener('DOMContentLoaded', async function() {
  // Add dynamic script loading function
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.body.appendChild(script);
    });
  }

  try {
    console.log('C# Code Graph Visualizer starting...');
    
    // Initialize UI references
    chartContainer = document.getElementById('chart');
    detailPanel = document.getElementById('detail-panel');
    loadingOverlay = document.getElementById('loading-overlay');
    tooltip = document.getElementById('tooltip');
    filterContainer = document.getElementById('filters-container');
    
    // Show loading overlay
    if (loadingOverlay) {
      console.log('Showing loading overlay');
      loadingOverlay.style.display = 'flex';
    } else {
      console.error('Loading overlay element not found!');
    }
    
    // Load modules in the required order
    console.log('Loading visualization modules...');
    await loadScript('visualizer-data.js');
    await loadScript('visualizer-styles.js');
    await loadScript('visualizer-filters.js');
    await loadScript('visualizer-ui.js');
    await loadScript('visualizer-core.js');
    
    console.log('All visualization modules loaded successfully');
    
    // Initialize the visualization manually since modules are loaded dynamically
    setTimeout(() => initVisualization(), 100);
  } catch (error) {
    console.error('Error loading visualization modules:', error);
    
    // Hide loading overlay on error
    if (loadingOverlay) {
      loadingOverlay.style.display = 'none';
    }
    
    // Show error to user
    alert('Failed to load visualization: ' + error.message);
  }
});

/**
 * Initialize the visualization
 */
async function initVisualization() {
  try {
    console.log('Initializing visualization...');
    
    // Load data
    await loadGraph();
    
    // Setup visualization components
    setupVisualization();
    
    // Initialize filters
    initializeFilters();
    
    // Add custom styles
    addStyles();
    
    // Setup event listeners for layout controls
    document.getElementById('force-layout').addEventListener('click', switchToForceDirectedLayout);
    document.getElementById('hierarchical-layout').addEventListener('click', switchToHierarchicalLayout);
    document.getElementById('reset-zoom').addEventListener('click', resetZoom);
    document.getElementById('reset-filters').addEventListener('click', resetAllFilters);
    
    // Hide loading overlay when complete
    if (loadingOverlay) {
      loadingOverlay.style.display = 'none';
      console.log('Visualization initialized successfully!');
    }
  } catch (error) {
    console.error('Error initializing visualization:', error);
    
    // Hide loading overlay on error
    if (loadingOverlay) {
      loadingOverlay.style.display = 'none';
    }
    
    alert('Failed to initialize visualization: ' + error.message);
  }
}
