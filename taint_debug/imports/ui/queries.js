import { Template } from 'meteor/templating';
import { Paths, Libs, Edges, Nodes, Sources, Sinks } from '../api/paths.js';
import { QueryResults } from '../api/queryresults.js';
import './queries.html';

import cytoscape from 'cytoscape';
import coseBilkent from 'cytoscape-cose-bilkent';
import fcose from 'cytoscape-fcose';
import cola from 'cytoscape-cola';
import avsdf from 'cytoscape-avsdf';
import cise from 'cytoscape-cise';
import elk from 'cytoscape-elk';
import klay from 'cytoscape-klay';

cytoscape.use( coseBilkent );
cytoscape.use( fcose );
cytoscape.use( cola );
cytoscape.use( avsdf );
cytoscape.use( cise );
cytoscape.use( elk );
cytoscape.use( klay );

function openGraphPopupWithResults(nodes, edges) {
  const popup = window.open('/cytoscapePopup.html', 'GraphPopup', 'width=800,height=600');

  if (!popup) {
    console.error("Popup could not be opened. Check if popups are blocked.");
    return;
  }

  popup.onload = function () {
    const cyContainer = popup.document.getElementById('cy');
    if (!cyContainer) {
      console.error('Cytoscape container not found in popup');
      return;
    }

    const cy = cytoscape({
      container: cyContainer,
      elements: { nodes, edges },
      style: [
        {
          selector: 'node',
          style: {
            'label': 'data(description)',
            'text-valign': 'center',
            'text-halign': 'center',
            'background-color': 'data(original-background-color)',
            'color': 'data(original-text-color)',
            'font-size': '14px',
            'text-outline-width': 2,
            'text-outline-color': '#000000'
          }
        },
        {
          selector: 'edge',
          style: {
            'label': 'data(description)',
            'curve-style': 'bezier',
            'target-arrow-shape': 'triangle',
            'line-color': '#aaaaaa',
            'target-arrow-color': '#aaaaaa',
            'width': 2,
            'font-size': '10px',
            'color': '#000000',
            'text-outline-width': 1,
            'text-outline-color': '#ffffff'
          }
        }
      ],
      layout: {
        name: 'cose' // Initial layout for the graph
      }
    });

    // Populate Node and Edge Dropdowns
    const nodeDropdown = popup.document.getElementById('focus-node');
    const edgeDropdown = popup.document.getElementById('focus-edge');

    nodes.forEach(node => {
      const option = popup.document.createElement('option');
      console.log("node", node);
      option.value = node.data.id;
      option.textContent = `${node.data.id} - ${node.data.description}`;
      nodeDropdown.appendChild(option);
    });

    edges.forEach(edge => {
      const option = popup.document.createElement('option');
      option.value = edge.data.id;
      option.textContent = `${edge.data.id} - ${edge.data.description}`;
      edgeDropdown.appendChild(option);
    });

    // Event listeners for focus functionality
    nodeDropdown.addEventListener('change', function () {
      focusOnNode(cy, this.value);
    });

    edgeDropdown.addEventListener('change', function () {
      focusOnEdge(cy, this.value);
    });

    // Attach event listeners for zoom and reorganize controls
    popup.document.getElementById('zoomInButton').onclick = function () {
      cy.zoom(cy.zoom() + 0.2);
    };
    popup.document.getElementById('zoomOutButton').onclick = function () {
      cy.zoom(cy.zoom() - 0.2);
    };
    popup.document.getElementById('resetZoomButton').onclick = function () {
      cy.zoom(1);
    };
    popup.document.getElementById('fitButton').onclick = function () {
      cy.fit();
    };
    popup.document.getElementById('removeFocusButton').onclick = function () {
      removeFocus(cy);
    };
    popup.document.getElementById('reorganizeButton').onclick = function () {
      reorganizeGraph(cy);
    };
    // populate the list
    const viewList = popup.document.getElementById('viewList');
    viewList.innerHTML = ''; // Clear previous options
    
    // Define the layout options
    const layoutList = ['cose', 'fcose', 'cose-bilkent', 'grid', 'avsdf', 'cise', 'elk', 'cola', 'klay', 'circle', 'concentric', 'breadthfirst', 'random'];
    layoutList.forEach(layout => {
      const option = popup.document.createElement('option');
      option.value = layout;
      option.textContent = layout;
      viewList.appendChild(option);
    });
    
    // Set up the event listener for when the selection changes
    viewList.onchange = function () {
      const selectedValue = this.value; // Access the selected option value
      cy.layout({
        name: selectedValue,
        animate: true
      }).run();
    };
    

    // Function to focus on a specific node by ID
    function focusOnNode(cy, nodeId) {
      removeFocus(cy); // Remove any previous focus
      const selectedNode = cy.getElementById(nodeId);
      if (selectedNode) {
        selectedNode.addClass('highlighted');
        selectedNode.style({ 'background-color': '#808080', 'color': '#FFFFFF' });
        cy.animate({ center: { eles: selectedNode }, zoom: 2 }, { duration: 300 });
      }
    }

    // Function to focus on a specific edge by ID
    function focusOnEdge(cy, edgeId) {
      removeFocus(cy); // Remove any previous focus
      const selectedEdge = cy.getElementById(edgeId);
      if (selectedEdge) {
        selectedEdge.addClass('highlighted');
        selectedEdge.style({ 'line-color': '#FF0000', 'target-arrow-color': '#FF0000' });
        cy.animate({ center: { eles: selectedEdge }, zoom: 2 }, { duration: 300 });
      }
    }

    // Function to remove focus from all elements
    function removeFocus(cy) {
      cy.elements().removeClass('highlighted');
      cy.nodes().forEach(node => {
        node.style({ 'background-color': node.data('original-background-color'), 'color': node.data('original-text-color') });
      });
      cy.edges().forEach(edge => {
        edge.style({ 'line-color': '#aaaaaa', 'target-arrow-color': '#aaaaaa' });
      });
    }

    // Function to reorganize the graph layout
    function reorganizeGraph(cy) {
      cy.layout({
        name: 'cose', // Reapply the 'cose' layout to reorganize the graph
        animate: true
      }).run();
    }

    // Highlight style for focused elements
    cy.style()
      .selector('.highlighted')
      .style({
        'background-color': '#FF851B',
        'line-color': '#FF4136',
        'target-arrow-color': '#FF4136',
        'color': '#FFFFFF'
      })
      .update();

    popup.cyInstance = cy; // Expose for debugging
  };
}

const formatNodeDescription = (nodeToAdd, nodeId) => {
  //console.log("nodeToAdd", nodeToAdd);
  if (!nodeToAdd || !nodeToAdd.file) return `Unknown, ${nodeId}`;

  let filename = '';
  if (nodeToAdd.file.includes('/src/main/java/')) {
    filename = nodeToAdd.file.split('/src/main/java/')[1];
  } else if (nodeToAdd.file.includes('/src/test/java/')) {
    filename = nodeToAdd.file.split('/src/test/java/')[1];
  }

  if (filename) {
    filename = filename.replace(/\//g, '.');
  } else {
    filename = nodeToAdd.file.split('/').pop();
  }

  nodeToAdd.file = filename;
  console.log("nodeToAdd", nodeToAdd);

  return `${nodeToAdd.description || nodeId}`;
};

async function callSouffleAndDisplayResults(queryType, sourceId, sinkId, secondSourceId, secondSinkId, selectedAPIId) {
  console.log('Running query:', queryType, sourceId, sinkId);
  
  const loader = document.getElementById('loadingSpinner');
  loader.style.display = 'block';  // Show loader



  try {
    // Using Promise for async call to ensure we wait for the result
    const result = await new Promise((resolve, reject) => {
      Meteor.call('runQuery', queryType, sourceId, sinkId, secondSourceId, secondSinkId, selectedAPIId, (error, res) => {
        if (error) reject(error);
        else resolve(res);
      });
    });

    console.log('Query result:', result);

    console.log(queryType)

    let queryResults;
    let queryParams = {}
    if (queryType === 'common_paths') {
      queryParams = { sourceId, sinkId, selectedAPIId, secondSourceId, secondSinkId };
    } else if (queryType === 'sinks_affected') {
      console.log("entered sinks affected")
      queryParams = { sourceId, selectedAPIId };
    } else {
      console.log("entered else")

      queryParams = { sourceId, sinkId };
    }

    console.log('Query params:', queryParams);

    for (let attempts = 0; attempts < 5; attempts++) { // max 5 retries
      await new Promise(r => setTimeout(r, 1000)); 
      queryResults = QueryResults.findOne(queryParams);
      console.log('Query results in loop:', queryResults);


      if (queryResults) break;
      await new Promise(r => setTimeout(r, 500)); 
    }

    if (!queryResults) {
      console.error('No query results found');
      return;
    }

    const nodesToKeep = queryResults.nodesOnPath;
    const cyNodesToShow = [];
    let edgesToKeep = [];

    if(queryType === 'common_paths' || queryType === 'divergent_sinks' || queryType === 'divergent_sources') {
      // find the common nodes
      const nodesOnFirstPath = queryResults.nodesOnPath;
      const nodesOnSecondPath = queryResults.nodesOnPath2;
      const commonNodes = nodesOnFirstPath.filter(node => nodesOnSecondPath.some(node2 => node[0] === node2[0]));
      const firstSource = parseInt(queryResults.sourceId);
      const secondSource = parseInt(queryResults.secondSourceId);
      const firstSink = parseInt(queryResults.sinkId);
      const secondSink = parseInt(queryResults.secondSinkId);

      console.log("commonNodes", commonNodes);

      // find the edges that are connecting the common nodes. Some nodes can be not connected to each other, we can end up with a disconnected graph
      const commonNodeIds = commonNodes.map(node => node[0]); // Adjust if commonNodes is already an array of IDs
      const allEdges = Edges.find({}).fetch();
      const edgesOnFirstPath = allEdges.filter(edge => nodesOnFirstPath.some(node => node[0] === parseInt(edge.sourceId)) && nodesOnFirstPath.some(node => node[0] === parseInt(edge.targetId)));

      console.log("allEdges", allEdges);
      console.log("commonNodeIds", commonNodeIds);
      edgesToKeep = edgesOnFirstPath
        .filter(edge => 
          commonNodeIds.includes(parseInt(edge.sourceId)) && commonNodeIds.includes(parseInt(edge.targetId))
        )
        .map(edge => ({
          group: 'edges',
          data: { source: 'node_' + edge.sourceId, target: 'node_' + edge.targetId }
        }));

      // add the common nodes to the nodes to show
      commonNodes.forEach(nodeOnPathTuple => {
        const nodeId = nodeOnPathTuple[0];
        const libNode = nodeOnPathTuple[2];

        let color = '#0074D9';
        let textColor = '#FFFFFF';
        const node = Nodes.findOne({ nodeId });

        if (libNode != -1) {
          color = '#FF851B';
        }
        if (nodeId === firstSource || nodeId === secondSource) {
          color = '#2ECC40'; // Green for source
        }
        if (nodeId === firstSink || nodeId === secondSink) {
          color = '#FF4136'; // Red for sink
        }

        cyNodesToShow.push({
          data: { id: 'node_' + nodeId, description: `${nodeId} ${(node?.description || '')}`, 'original-background-color': color, 'original-text-color': textColor },
          style: { 'background-color': color, 'color': textColor }
        });
      });

      // add the common edges to the edges to keep
      commonNodes.forEach(nodeOnPathTuple => {
        const nodeId = nodeOnPathTuple[0];
        const libNode = nodeOnPathTuple[2];

        let color = '#0074D9';
        let textColor = '#FFFFFF';
        const node = Nodes.findOne({ nodeId });

        if (nodeId === sourceId) {
          return;
        }
        if (libNode != -1) {
          color = '#FF851B';
        }

        cyNodesToShow.push({
          data: { id: 'node_' + nodeId, description: `${nodeId} ${(node?.description || '')}`, 'original-background-color': color, 'original-text-color': textColor },
          style: { 'background-color': color, 'color': textColor }
        });
      });


    }
    else if(queryType === 'sinks_affected') {
      const sinksNonReachable = queryResults.libNodes;
      const sourceId = parseInt(queryResults.sourceId);

      const allPaths = queryResults.nodesOnPath;

      // we will define distinct paths where we will parse through allPaths, our sourceId defines where we start and end. i.e., nodesOnPath: [ 18, 0, -1 ], [ 464, 4, -1 ], [ 1386, 7, -1 ], [ 18, 0, -1 ], [ 1388, 7, -1 ]: We have two paths here, 18 -> 464 -> 1386 and 18 -> 1388
      let distinctPaths = [];
      let currentPath = [];
      allPaths.forEach(path => {
        if (path[0] === sourceId) {
          if (currentPath.length > 0) {
            distinctPaths.push(currentPath);
          }
          currentPath = [];
        }
        currentPath.push(path);
      });

      if (currentPath.length > 0) {
        distinctPaths.push(currentPath);
      }

      console.log("distinctPaths", distinctPaths);

      // now let's push all distinct paths to the cyNodesToShow
      distinctPaths.forEach(path => {
        path.forEach(nodeOnPathTuple => {
          const nodeId = nodeOnPathTuple[0];
          const libNode = nodeOnPathTuple[2];

          let color = '#0074D9';
          let textColor = '#FFFFFF';
          const node = Nodes.findOne({ nodeId });

          if (libNode != -1) {
            color = '#FF851B';
          }
          if (nodeId === sourceId) {
            color = '#2ECC40'; // Green for source
          }
          else if (sinksNonReachable.includes(nodeId)) {
            color = '#FF4136'; // Red for sink
          }

          cyNodesToShow.push({
            data: { id: 'node_' + nodeId, description: `${nodeId} ${(node?.description || '')}`, 'original-background-color': color, 'original-text-color': textColor },
            style: { 'background-color': color, 'color': textColor }
          });
        });
      });

      // edges to keep (do it in a loop iterating through each distinct path)
      const allEdges = Edges.find({}).fetch();
      edgesToKeep = allEdges
        .filter(edge => cyNodesToShow.some(node => node.data.id === 'node_' + edge.sourceId) && cyNodesToShow.some(node => node.data.id === 'node_' + edge.targetId))
        .map(edge => ({
          group: 'edges',
          data: { source: 'node_' + edge.sourceId, target: 'node_' + edge.targetId }
        }));

        
    }
    else if (queryType === 'global_impact') {
      console.log("DEBUG! queryResults", queryResults);
      
      const libNodes = queryResults.libNodes;
      const libScores = queryResults.libScores;

      const allPaths = queryResults.nodesOnPath;
      const sourceId = parseInt(queryResults.sourceId);
      const sinkId = parseInt(queryResults.sinkId);

      // libScores: Array [ {…}, {…} ] 0: Object { lib: 9753, score: 42 }, 1: Object { lib: 9771, score: 3 }
      // We will use the scores to set the sizes of the lib nodes
      const maxScore = Math.max(...libScores.map(lib => lib.score));
      const minScore = Math.min(...libScores.map(lib => lib.score));
      const maxNodeSize = 100;
      const minNodeSize = 20;

      // The library node id from libNodes is the 3rd index of the nodesOnPath tuple (if it is a library node)
      allPaths.forEach(path => {
        const nodeId = path[0];
        const libNode = path[2];

        let color = '#0074D9';
        let textColor = '#FFFFFF';

        const node = Nodes.findOne({ nodeId });

        if(libNode != -1) {
          color = '#FF851B';
          const libScore = libScores.find(lib => lib.lib === libNode).score;
          const nodeSize = minNodeSize + ((libScore - minScore) / (maxScore - minScore)) * (maxNodeSize - minNodeSize);
          cyNodesToShow.push({
            data: { id: 'node_' + nodeId, description: `${nodeId} ${(node?.description || '')}`, 'original-background-color': color, 'original-text-color': textColor },
            style: { 'background-color': color, 'color': textColor, 'width': nodeSize, 'height': nodeSize }
          });
          return;
        } 
        if (nodeId === sourceId) {
          color = '#2ECC40'; // Green for source
          console.log("Color src", sourceId);
        } else if (nodeId === sinkId) {
          color = '#FF4136'; // Red for sink
          console.log("Color sink", sinkId);
        } 
        cyNodesToShow.push({
          data: { id: 'node_' + nodeId, description: `${nodeId} ${(node?.description || '')}`, 'original-background-color': color, 'original-text-color': textColor },
          style: { 'background-color': color, 'color': textColor }
        });
      });

      // edges to keep
      const allEdges = Edges.find({}).fetch();

      edgesToKeep = allEdges
        .filter(edge => cyNodesToShow.some(node => node.data.id === 'node_' + edge.sourceId) && cyNodesToShow.some(node => node.data.id === 'node_' + edge.targetId))
        .map(edge => ({
          group: 'edges',
          data: { source: 'node_' + edge.sourceId, target: 'node_' + edge.targetId }
        }));

        
    }
    else {
      nodesToKeep.forEach(nodeOnPathTuple => {
        const nodeId = nodeOnPathTuple[0];
        const libNode = nodeOnPathTuple[2];
        
        const sourceId = parseInt(queryResults.sourceId);
        const sinkId = parseInt(queryResults.sinkId);

        let color = '#0074D9';
        let textColor = '#FFFFFF';
        const node = Nodes.findOne({ nodeId });

        if(libNode != -1) {
          color = '#FF851B';
        } 
        if (nodeId === sourceId) {
          color = '#2ECC40'; // Green for source
          console.log("Color src", sourceId);
        } else if (nodeId === sinkId) {
          color = '#FF4136'; // Red for sink
          console.log("Color sink", sinkId);
        } 

        cyNodesToShow.push({
          data: { id: 'node_' + nodeId, description: formatNodeDescription(node, nodeId), 'original-background-color': color, 'original-text-color': textColor },
          style: { 'background-color': color, 'color': textColor }
        });
      });

      console.log('Nodes:', cyNodesToShow);

      const nodeIdsToKeep = cyNodesToShow.map(node => node.data.id);

      const allEdges = Edges.find({}).fetch();
      edgesToKeep = allEdges
        .filter(edge => nodeIdsToKeep.includes('node_' + edge.sourceId) && nodeIdsToKeep.includes('node_' + edge.targetId))
        .map(edge => ({
          group: 'edges',
          data: { source: 'node_' + edge.sourceId, target: 'node_' + edge.targetId }
        }));
      }

    console.log("DEBUG! cyNodesToShow", cyNodesToShow);
    console.log("DEBUG! edgesToKeep", edgesToKeep);

    // Open the popup and initialize the graph with nodes and edges
    openGraphPopupWithResults(cyNodesToShow, edgesToKeep);

  } catch (error) {
    console.error('Error running query:', error);
  } finally {
    loader.style.display = 'none';  // Hide loader
  }
}

let nodeMapping = {};

Template.queries.onCreated(function() {
  this.nodes = new ReactiveVar([]);
  this.edges = new ReactiveVar([]);
  this.sources = new ReactiveVar([]);
  this.sinks = new ReactiveVar([]);
  this.libraryNodes = new ReactiveVar([]);
  this.libraries = new ReactiveVar([]);
  
  Meteor.defer(() => {
    Meteor.call('readNodeNames', (error, result) => {
      console.log('Node mapping:', result);
      if (error) {
        console.error('Error reading node mapping:', error);
        return;
      }
  
      nodeMapping = result; // Store the node mapping globally
      console.log("mapping", nodeMapping);
  
      Meteor.call('getFactNodes', (error, factNodesResult) => {
        if (error) {
          console.error('Error reading graph data:', error);
        } else {
          const nodes = factNodesResult.nodes.map(node => {
            const nodeId = node.nodeId;
            const nodeToAdd = nodeMapping[nodeId];
            if (!nodeToAdd) {
              console.error(`Node with ID ${nodeId} not found in nodeMapping`);
              return { id: nodeId, description: `Unknown, ${nodeId}` };
            }
            console.log("mapping", nodeMapping);
            return {
              id: nodeId,
              description: formatNodeDescription(nodeToAdd, nodeId),
            };
          });
  
          const sources = factNodesResult.sources.map(sourceId => {
            const nodeToAdd = nodeMapping[sourceId];
            if (!nodeToAdd) {
              console.error(`Source with ID ${sourceId} not found in nodeMapping`);
              return { id: sourceId, description: `Unknown, ${sourceId}` };
            }
            return {
              id: sourceId,
              description: formatNodeDescription(nodeToAdd, sourceId),
            };
          });
  
          const sinks = factNodesResult.sinks.map(sinkId => {
            const nodeToAdd = nodeMapping[sinkId];
            if (!nodeToAdd) {
              console.error(`Sink with ID ${sinkId} not found in nodeMapping`);
              return { id: sinkId, description: `Unknown, ${sinkId}` };
            }
            return {
              id: sinkId,
              description: formatNodeDescription(nodeToAdd, sinkId),
            };
          });
  
          this.nodes.set(nodes);
          this.sources.set(sources);
          this.sinks.set(sinks);
          this.edges.set(factNodesResult.edges.map(edge => ({
            id: edge.edgeId,
            description: edge.description,
          })));
        }
      });
    });
  });
  
});

Template.registerHelper('eq', (a, b) => {
  return a === b;
});



Template.queries.helpers({
  queries() {
    return [
      { description: "WhyFlow: Which APIs are intermediaries from a source to a sink?", queryType: "why_node_pair" , showSource : true, showSink: true},
      { description: "WhyNotFlow: Which APIs are sanitizers that disconnect a flow from a source to a sink?", queryType: "whynot_node_pairs" , showSource: true, showSink: true},
      { description: "AffectedSinks: What are sinks that would be no longer reachable if this API X becomes a sanitizer?", queryType: "sinks_affected", selectAPI: true, showSource: true},
      { description: "GlobalImpact: Rank the global impact of intermediary APIs from a source and a sink based on frequency.", queryType: "global_impact", showSource : true, showSink: true},
      { description: "CommonFlows: which intermediaries are common between two pairs of a source and a sink?", queryType: "common_paths", showSource: true, showSink: true, pairedQuery: true},
      { description: "DivergentSinks: which intermediaries are common between a source and a pair of sinks?", queryType: "divergent_sinks", showSource: true, showSink: true},
      { description: "DivergentSources: which intermediaries are common between a pair of sources and a sink?", queryType: "divergent_sources", showSource: true, showSink: true},

    ];
  },
  whySources() {
    
      return Sources.find({isReported: true}).fetch().map(source => {
        return {
          id: source.nodeId,
          description: source.description
        }
      });

  },
  whyNotSources() {
      
        return Sources.find({isReported: false}).fetch().map(source => {
          return {
            id: source.nodeId,
            description: source.description
          }
        });
  },
  sinksAffectedSources() {
    let selectedApi = Session.get('selectedAPIId');
    // find paths where some middle node has lib=selectedApi
    let paths = Paths.find({ 'middle.lib': selectedApi }).fetch();
    let sources = paths.map(path => path.left.nodeId);

    return [...new Set(sources)].map(sourceId => {
      const nodeToAdd = nodeMapping[sourceId];
      if (!nodeToAdd) {
        console.error(`Node with ID ${sourceId} not found in nodeMapping`);
        return { id: sourceId, description: 'Unknown' };
      }
      nodeToAdd.file = nodeToAdd.file.split('/').pop();
      const sourceDescription = nodeToAdd.file + ", " + nodeToAdd.line + ", " + nodeToAdd.column + ", " + nodeToAdd.end_line + ", " + nodeToAdd.end_column + ", " + nodeToAdd.description || sourceId;
      return { id: sourceId, description: sourceDescription };
    });
  },
  whySinks() {
    
    // fetch current selected source
    const selectedSourceId = Session.get('whySelectedSourceId');

    if (!selectedSourceId) {
      
      return [];
    }
    return fetchSinks("why_node_pair", selectedSourceId);
  },

  whyNotSinks() {
    // fetch current selected source
    const selectedSourceId = Session.get('whynotSelectedSourceId');

    if (!selectedSourceId) {
      
      return [];
    }
    return fetchSinks("whynot_node_pairs", selectedSourceId);
  },

  secondPairSources() {
    return Sources.find({isReported: true}).fetch().map(source => {
      return {
        id: source.nodeId,
        description: source.description
      }
    });


  },

  secondPairSinks() {
        // fetch current selected source
        const selectedSourceId = Session.get('selectedSecondSourceId');

        if (!selectedSourceId) {
          
          return [];
        }
        return fetchSinks("why_node_pair", selectedSourceId);

  },
  apis() {
    // let values = Template.instance().libraries.get();

    // fetch from Libs
    
    let values = Libs.find({}).fetch();

    values = values.filter((v, i, a) => a.indexOf(v) === i);
    values.sort();
    return values;
  },
  nodes() {
    return Template.instance().nodes.get();
  },
  edges() {
    return Template.instance().edges.get();
  }
});

Template.queries.events({
  'change .focus-dropdown-node'(event) {
    const selectedNodeId = event.target.value;
    const cy = window.cyInstance;

    function resetColors() {
      cy.nodes().forEach(node => {
        node.removeClass('highlighted');
        node.style('background-color', node.data('original-background-color'));
        node.style('color', node.data('original-text-color'));
      });
      cy.edges().removeClass('highlighted');
    }

    resetColors();
    const selectedNode = cy.getElementById('node_' + selectedNodeId);
    selectedNode.addClass('highlighted');
    selectedNode.style('background-color', '#808080');
    selectedNode.style('color', '#FFFFFF');
    cy.animate({
      center: { eles: selectedNode },
      zoom: 2
    }, {
      duration: 200
    });

    const referenceId = selectedNode._private.edges[0]._private.data.description.split(" ")[1];

    const pathContent = document.getElementById('pathContent_' + referenceId);
    const collapseButton = document.getElementById('collapse-button_' + referenceId);

    if (pathContent) {
      pathContent.style.display = 'block';
      collapseButton.innerHTML = 'Collapse';

      const pathId = Paths.findOne({ warningNumber: parseInt(referenceId) })._id;
      Session.set('inspectedWarning', pathId);

      const currentWarning = Session.get('inspectedWarning');
      Session.set('whyNodeModel', currentWarning);
      Session.set('inspectedLib', '');

      const elementToScrollTo = document.getElementById("warning_" + referenceId);
      if (elementToScrollTo) {
        elementToScrollTo.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  },

  'click .query-button'(event) {
    const button = event.currentTarget;
    let queryType = button.getAttribute('data-query-type');

    // Get associated dropdown values
    const sourceId = document.getElementById(button.getAttribute('data-src-dropdown-id'))?.value;
    const sinkId = document.getElementById(button.getAttribute('data-sink-dropdown-id'))?.value;
    let secondSourceId = document.getElementById(button.getAttribute('data-second-src-dropdown-id'))?.value;
    let secondSinkId = document.getElementById(button.getAttribute('data-second-sink-dropdown-id'))?.value;
    const selectedAPIId = document.getElementById(button.getAttribute('data-api-dropdown-id'))?.value;

    console.log('Run Query Button Clicked');
    console.log('Query Type:', queryType);
    console.log('Source ID:', sourceId);
    console.log('Sink ID:', sinkId);
    console.log('Second Source ID:', secondSourceId);
    console.log('Second Sink ID:', secondSinkId);
    console.log('API ID:', selectedAPIId);

    if(queryType === 'divergent_sinks'){
      secondSourceId = sourceId;
      queryType = 'common_paths';
    }
    if(queryType === 'divergent_sources'){
      secondSinkId = sinkId;
      queryType = 'common_paths';
    }

    // Call the query function
    callSouffleAndDisplayResults(queryType, sourceId, sinkId, secondSourceId, secondSinkId, selectedAPIId);
  },

  'change .focus-dropdown-edge'(event) {
    const selectedEdgeId = event.target.value;
    const cy = window.cyInstance;

    function resetColors() {
      cy.nodes().forEach(node => {
        node.removeClass('highlighted');
        node.style('background-color', node.data('original-background-color'));
        node.style('color', node.data('original-text-color'));
      });
      cy.edges().removeClass('highlighted');
    }

    resetColors();
    const selectedEdge = cy.getElementById('edge_' + selectedEdgeId);
    selectedEdge.addClass('highlighted');
    cy.animate({
      center: { eles: selectedEdge },
      zoom: 2
    }, {
      duration: 200
    });

    const referenceId = selectedEdge.data('description').split(" ")[1];
    const elementToScrollTo = document.getElementById("warning_" + referenceId);
    if (elementToScrollTo) {
      elementToScrollTo.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  },

  'change .src-dropdown'(event) {
    const selectedSourceId = $(event.target).val();

    console.log('Selected source:', selectedSourceId);  

    console.log('Selected source:', selectedSourceId);

    const selectedSinkId = $(event.target).closest('.query-box').find('.sink-dropdown').val();

    console.log('Selected sink:', selectedSinkId);

    const queryType = $(event.target).closest('.query-box').attr('data-query');

    Session.set('selectedSourceId', selectedSourceId);
    Session.set('queryType', queryType);

    if (queryType === 'why_node_pair' || queryType === 'common_paths' || queryType === 'global_impact') {
      Session.set('whySelectedSourceId', selectedSourceId);
    } else if (queryType === 'whynot_node_pairs') {
      Session.set('whynotSelectedSourceId', selectedSourceId);
    }

    let selectedSecondSourceId = '';
    let selectedSecondSinkId = '';
    if (queryType === 'common_paths') {
      selectedSecondSourceId = $(event.target).closest('.query-box').find('.second-src-dropdown').val();
      selectedSecondSinkId = $(event.target).closest('.query-box').find('.second-sink-dropdown').val();
    }

    let selectedApiId = $(event.target).closest('.query-box').find('.api-dropdown').val();

    //callSouffleAndDisplayResults(queryType, selectedSourceId, selectedSinkId, selectedSecondSourceId, selectedSecondSinkId, selectedApiId);
  },
  'change .sink-dropdown'(event) {
    const selectedSinkId = $(event.target).val();

    console.log('Selected sink:', selectedSinkId);

    const selectedSourceId = $(event.target).closest('.query-box').find('.src-dropdown').val();
    const queryType = $(event.target).closest('.query-box').attr('data-query');

    Session.set('selectedSinkId', selectedSinkId);
    Session.set('queryType', queryType);

    let selectedSecondSourceId = '';
    let selectedSecondSinkId = '';
    if (queryType === 'common_paths') {
      selectedSecondSourceId = $(event.target).closest('.query-box').find('.second-src-dropdown').val();
      selectedSecondSinkId = $(event.target).closest('.query-box').find('.second-sink-dropdown').val();
    }


    let selectedApiId = $(event.target).closest('.query-box').find('.api-dropdown').val();

    //callSouffleAndDisplayResults(queryType, selectedSourceId, selectedSinkId, selectedSecondSourceId, selectedSecondSinkId, selectedApiId);
  },
  'change .second-src-dropdown'(event) {
    const selectedSecondSourceId = $(event.target).val();
    const selectedSecondSinkId = $(event.target).closest('.query-box').find('.second-sink-dropdown').val();
    const queryType = $(event.target).closest('.query-box').attr('data-query');

    Session.set('selectedSecondSourceId', selectedSecondSourceId);
    Session.set('queryType', queryType);

    const selectedSourceId = $(event.target).closest('.query-box').find('.src-dropdown').val();
    const selectedSinkId = $(event.target).closest('.query-box').find('.sink-dropdown').val();

    //callSouffleAndDisplayResults(queryType, selectedSourceId, selectedSinkId, selectedSecondSourceId, selectedSecondSinkId, null);
  },
  'change .second-sink-dropdown'(event) {
    const selectedSecondSinkId = $(event.target).val();
    const selectedSecondSourceId = $(event.target).closest('.query-box').find('.second-src-dropdown').val();
    const queryType = $(event.target).closest('.query-box').attr('data-query');

    // write to session
    Session.set('selectedSecondSinkId', selectedSecondSinkId);
    Session.set('queryType', queryType);

    const selectedSourceId = $(event.target).closest('.query-box').find('.src-dropdown').val();
    const selectedSinkId = $(event.target).closest('.query-box').find('.sink-dropdown').val();

    //callSouffleAndDisplayResults(queryType, selectedSourceId, selectedSinkId, selectedSecondSourceId, selectedSecondSinkId, null);
  },
  'change .api-dropdown'(event) {
    const selectedAPIId = $(event.target).val();
    const queryType = $(event.target).closest('.query-box').attr('data-query');

    Session.set('selectedAPIId', selectedAPIId);
    Session.set('queryType', queryType);

    const selectedSourceId = $(event.target).closest('.query-box').find('.src-dropdown').val();
    const selectedSinkId = $(event.target).closest('.query-box').find('.sink-dropdown').val();

    //callSouffleAndDisplayResults(queryType, selectedSourceId, selectedSinkId, null, null, selectedAPIId);
  },
});

Template.queries.onRendered(function() {
  this.findAll('.start,.end,.middle').forEach(function(element) {
    hljs.highlightBlock(element, { language: 'java' });
    element.innerHTML = element.innerHTML.replace(/---focus---/g, '<strong class="focus" style="background-color: red;color: white!important;">').replace(/---\/focus---/g, '</strong>');
  });
});

function fetchSinks(queryType, selectedSourceId) {
  const paths = Paths.find({ 'left.nodeId': parseInt(selectedSourceId) }).fetch();
  const sinks = paths.map(path => path.right.nodeId);

  return [...new Set(sinks)].map(sinkId => {
    const nodeToAdd = nodeMapping[sinkId];
    if (!nodeToAdd) {
      console.error(`Sink with ID ${sinkId} not found in nodeMapping`);
      return { id: sinkId, description: `Unknown, ${sinkId}` };
    }
    return { id: sinkId, description: formatNodeDescription(nodeToAdd, sinkId) };
  });
}

function fetchSources(queryType, selectedSinkId) {
  const paths = Paths.find({ 'right.nodeId': parseInt(selectedSinkId) }).fetch();
  const sources = paths.map(path => path.left.nodeId);

  return [...new Set(sources)].map(sourceId => {
    const nodeToAdd = nodeMapping[sourceId];
    if (!nodeToAdd) {
      console.error(`Source with ID ${sourceId} not found in nodeMapping`);
      return { id: sourceId, description: `Unknown, ${sourceId}` };
    }
    return { id: sourceId, description: formatNodeDescription(nodeToAdd, sourceId) };
  });
}
