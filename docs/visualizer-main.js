/**
 * Main entry point for the C# Code Graph Visualizer
 * This file loads all the required modules in the correct order
 */

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
    // Load modules in the required order
    await loadScript('visualizer-data.js');
    await loadScript('visualizer-styles.js');
    await loadScript('visualizer-filters.js');
    await loadScript('visualizer-ui.js');
    await loadScript('visualizer-core.js');
    
    console.log('All visualization modules loaded successfully');
  } catch (error) {
    console.error('Error loading visualization modules:', error);
  }
});
