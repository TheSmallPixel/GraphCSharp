/**
 * Main entry point for the C# Code Graph Visualizer
 * This file loads all the required modules and contains all shared variables
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

// Initialize when the document is loaded
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
  }
  
  // Load the original visualizer script
  const script = document.createElement('script');
  script.src = 'enhanced_visualizer.js';
  script.onload = function() {
    console.log('Visualization loaded successfully');
  };
  script.onerror = function(error) {
    console.error('Error loading visualization:', error);
    if (loadingOverlay) {
      loadingOverlay.style.display = 'none';
    }
    alert('Failed to load visualization: ' + error);
  };
  document.body.appendChild(script);
});
