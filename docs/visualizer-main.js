/**
 * Main entry point for the C# Code Graph Visualizer
 * This file defines all global variables and orchestrates the visualization initialization
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

// State tracking
let selectedNode = null;
let highlightedNode = null;

// Load the visualization modules sequentially with promises
document.addEventListener('DOMContentLoaded', function() {
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
  
  // Manually define the loadGraph function from visualizer-data.js
  window.loadGraph = async function() {
    console.log("Loading graph data...");
    
    try {
      const response = await fetch('graph.json');
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
  };
  
  // Create wrapper function to initialize visualization
  window.initializeVisualization = async function() {
    try {
      console.log('Initializing visualization...');
      
      // Load data
      await loadGraph();
      
      // Setup visualization components
      setupVisualization();
      
      // Initialize filters
      initializeFilters();
      
      // Add custom styles if defined
      if (typeof addStyles === 'function') {
        addStyles();
      }
      
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
  };

  // Initialize visualization after page load
  setTimeout(() => {
    window.initializeVisualization();
  }, 500);
});
