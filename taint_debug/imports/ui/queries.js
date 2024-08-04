import { Template } from 'meteor/templating';
import { Paths, Libs,Edges,  Nodes } from '../api/paths.js';
import { QueryResults } from '../api/queryresults.js';
import './queries.html';


function callSouffleAndDisplayResults(queryType, sourceId, sinkId, secondSourceId, secondSinkId, selectedAPIId) {
  console.log('Running query:', queryType, sourceId, sinkId);
  Meteor.call('runQuery', queryType, sourceId, sinkId,secondSourceId, secondSinkId,selectedAPIId, (error, result) => {
    if (error) {
      console.error('Error running query:', error);
    } else {
      console.log('Query result:', result);
    }
    
    // fetch latest QueryResults
    const queryResults = QueryResults.findOne({sourceId: sourceId, sinkId: sinkId});
    
    // const queryResults = result;
    console.log('QueryResults:', queryResults);

    if (!queryResults) {
      console.error('No query results found');
      return;
    }

    // clear the graph, show only the nodes in QueryResults
    const cy = window.cyInstance;
    

    
    const nodesToKeep = queryResults.nodesOnPath;
    const cyNodesToShow = [];

    
    
    nodesToKeep.forEach(nodeOnPathTuple => {
      const nodeId = nodeOnPathTuple[0];

      const libNode = nodeOnPathTuple[2];

      let color = '#0074D9';
      let textColor = '#FFFFFF';
      const node = Nodes.findOne({
        nodeId: nodeId
      });

      // skip source
      if (nodeId === sourceId) {
        return;
      }
      // if node is a library node, color it differently
      if (libNode != -1) {
        color = '#FF851B';
      }
        
      cyNodesToShow.push({
        data: { id: 'node_' + nodeId, description: nodeId + ' ' + node.description, 'original-background-color': color, 'original-text-color': textColor },
        style: { 'background-color': color, 'color': textColor }
      });
    });
    // also the source and sink nodes
    cyNodesToShow.push({
      data: { id: 'node_' + sourceId, description: sourceId + ' Source', 'original-background-color': '#2ECC40', 'original-text-color': '#FFFFFF' },
      style: { 'background-color': '#2ECC40', 'color': '#FFFFFF' }
    });
    cyNodesToShow.push({
      data: { id: 'node_' + sinkId, description: sinkId + ' Sink', 'original-background-color': '#FF4136', 'original-text-color': '#FFFFFF' },
      style: { 'background-color': '#FF4136', 'color': '#FFFFFF' }
    });

      console.log('Nodes:', cyNodesToShow);

      const nodeIdsToKeep = cyNodesToShow.map(node => node.data.id);

        // Keep edges that connect nodes in nodesToKeep
        const allEdges =Edges.find({}).fetch();
    const edgesToKeep = allEdges.filter(edge => 
      nodeIdsToKeep.includes('node_' + edge.sourceId) && nodeIdsToKeep.includes('node_' + edge.targetId)
    );

    cy.elements().remove();


      // add to cy
      cy.add(cyNodesToShow);

    
    edgesToKeep.forEach(edge => {
      cy.add({
        group: 'edges',
        data: { source: 'node_' +  edge.sourceId, target: 'node_' + edge.targetId }
      });
    });

    // Layout the graph for better visualization
    cy.layout({ name: 'cose' }).run();
  });
}

Template.queries.onCreated(function() {
  this.nodes = new ReactiveVar([]);
  this.edges = new ReactiveVar([]);
  this.sources = new ReactiveVar([]);
  this.sinks = new ReactiveVar([]);
  this.libraryNodes = new ReactiveVar([]);
  this.libraries= new ReactiveVar([]);
  
  Meteor.defer(() => {
    Meteor.call('getFactNodes', (error, result) => {
      if (error) {
        console.error('Error reading graph data:', error);
      } else {
        const nodes = result.nodes.map(node => node.nodeId);
        const edges = result.edges;
        const sources = result.sources;
        const sinks = result.sinks;

        console.log('Nodes:', nodes);
        console.log('Edges:', edges);
        
        this.nodes.set(nodes);
        this.edges.set(edges);
        this.sources.set(sources);
        this.sinks.set(sinks);
        this.libraryNodes.set(result.apis);
        this.libraries.set(result.apiLibs);


        console.log('Library Nodes:', this.libraryNodes);
      }
    });
  });
});

Template.queries.helpers({
  queries() {
    return [
      { description: "WhyFlow: Tracking data flows from", queryType: "why_node_pair" , whyQuery : true},
      { description: "WhyNotFlow: Identifying sanitizers that remove data flows from", queryType: "whynot_node_pairs" , whyQuery: true},
      { description: "CommonFlows: Common API usages between different flow paths from", queryType: "common_paths", whyQuery: true, pairedQuery: true},
      { description: "What If Relax: ", queryType: "whatif_relax", whatIfQuery: true},
      { description: "What If Restrict: ", queryType: "whatif_restrict", whatIfQuery: true},
    ];
  },
  sources() {
    // const selectedSinkId = Session.get('selectedSinkId');

    // if (!selectedSinkId) {
      return Template.instance().sources.get();
    // }

    // const queryType = Session.get('queryType');// TODO we should be reading queryType from the position in the list of queries

    // return fetchSources(queryType, selectedSinkId);
  },
  sinks() {
    
    // fetch current selected source
    const selectedSourceId = Session.get('selectedSourceId');

    if (!selectedSourceId) {
      return Template.instance().sinks.get();
    }
    const queryType = Session.get('queryType'); // TODO we should be reading queryType from the position in the list of queries

    return fetchSinks(queryType, selectedSourceId);
  },
  secondPairSources() {
    const selectedSinkId = Session.get('selectedSecondSinkId');

    if (!selectedSinkId) {
      return Template.instance().sources.get();
    }

    const queryType = Session.get('queryType');// TODO we should be reading queryType from the position in the list of queries

    return fetchSources(queryType, selectedSinkId);

  },

  secondPairSinks() {
    const selectedSourceId = Session.get('selectedSecondSourceId');

    if (!selectedSourceId) {
      return Template.instance().sinks.get();
    }
    const queryType = Session.get('queryType'); // TODO we should be reading queryType from the position in the list of queries

    return fetchSinks(queryType, selectedSourceId);

  },
  apis() {
    let values = Template.instance().libraries.get();

    // remove duplicate and sort

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
  const cy = window.cyInstance; // Access the Cytoscape instance

  // Function to reset all nodes and edges to their original colors
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
  selectedNode.style('background-color', '#808080'); // Change color to gray
  selectedNode.style('color', '#FFFFFF'); // Change text color to white
  cy.animate({
    center: { eles: selectedNode },
    zoom: 2 // You can adjust the zoom level as needed
  }, {
    duration: 200 // Animation duration in milliseconds
  });

  // Scroll to the corresponding code snippet
  console.log('tapped ' + selectedNode.id());
  console.log('node data:', selectedNode);
  console.log('edge data:', selectedNode._private.edges[0]._private.data.id);

  var referenceId = selectedNode._private.edges[0]._private.data.description;
  // Get the reference ID of the node Warning 17 id:14 --> 17
  referenceId = referenceId.split(" ")[1];

  console.log('referenceId:', referenceId);

  // Expand the pathContent div and ensure all child divs are displayed
  const pathContent = document.getElementById('pathContent_' + referenceId);
  const collapseButton = document.getElementById('collapse-button_' + referenceId);

  console.log('pathContent:', pathContent);

  if (pathContent) {
    pathContent.style.display = 'block';
    collapseButton.innerHTML = 'Collapse';

    const pathId = Paths.findOne({ warningNumber: parseInt(referenceId) })._id;
    console.log('pathId:', pathId);
    Session.set('inspectedWarning', pathId);

    // Use the same logic as in Template.questionChoices.events to ensure the div is fully expanded
    const currentWarning = Session.get('inspectedWarning');
    Session.set('whyNodeModel', currentWarning);
    Session.set('inspectedLib', '');

    // Scroll to the relevant code snippet
    const elementToScrollTo = document.getElementById("warning_" + referenceId);
    if (elementToScrollTo) {
      elementToScrollTo.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
},

  'change .focus-dropdown-edge'(event) {
    const selectedEdgeId = event.target.value;
    const cy = window.cyInstance; // Access the Cytoscape instance

    // Function to reset all nodes and edges to their original colors
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
      zoom: 2 // You can adjust the zoom level as needed
    }, {
      duration: 200 // Animation duration in milliseconds
    });

    // Scroll to the relevant code snippet
    var referenceId = selectedEdge.data('description');
    var warningNumber = referenceId.split(" ")[1];
    var elementToScrollTo = document.getElementById("warning_" + warningNumber);
    if (elementToScrollTo) {
      elementToScrollTo.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  },

  'change .src-dropdown'(event) {
    console.log('a sink dropdown saw a value change');
    const selectedSourceId = $(event.target).val();
    
    const selectedSinkId = $(event.target).closest('.query-box').find('.sink-dropdown').val();
    const queryType = $(event.target).closest('.query-box').attr('data-query');

    // write to session
    Session.set('selectedSourceId', selectedSourceId);
    Session.set('queryType', queryType);

    // for paired queries, we need to fetch the second pair dropdowns values
    let selectedSecondSourceId = '';
    let selectedSecondSinkId = '';
    if (queryType === 'common_paths') {
      selectedSecondSourceId = $(event.target).closest('.query-box').find('.second-src-dropdown').val();
      selectedSecondSinkId = $(event.target).closest('.query-box').find('.second-sink-dropdown').val();
    }

    let selectedApiId = $(event.target).closest('.query-box').find('.api-dropdown').val();

    callSouffleAndDisplayResults(queryType, selectedSourceId, selectedSinkId, selectedSecondSourceId, selectedSecondSinkId, selectedApiId);
  },
  'change .sink-dropdown'(event) {
    console.log('a sink dropdown saw a value change');
    const selectedSinkId = $(event.target).val();
    
    const selectedSourceId = $(event.target).closest('.query-box').find('.src-dropdown').val();

    const queryType = $(event.target).closest('.query-box').attr('data-query');

    // write to session
    Session.set('selectedSinkId', selectedSinkId);
    Session.set('queryType', queryType);

    // for paired queries, we need to fetch the second pair dropdowns values
    let selectedSecondSourceId = '';
    let selectedSecondSinkId = '';
    if (queryType === 'common_paths') {
      selectedSecondSourceId = $(event.target).closest('.query-box').find('.second-src-dropdown').val();
      selectedSecondSinkId = $(event.target).closest('.query-box').find('.second-sink-dropdown').val();
    }

    let selectedApiId = $(event.target).closest('.query-box').find('.api-dropdown').val();

    callSouffleAndDisplayResults(queryType, selectedSourceId, selectedSinkId, selectedSecondSourceId, selectedSecondSinkId, selectedApiId);

  },
  'change .second-src-dropdown'(event) {
    console.log('2nd src dropdown saw a value change');
    const selectedSecondSourceId = $(event.target).val();
    
    const selectedSecondSinkId = $(event.target).closest('.query-box').find('.second-sink-dropdown').val();
    const queryType = $(event.target).closest('.query-box').attr('data-query');

    // write to session
    Session.set('selectedSecondSourceId', selectedSecondSourceId);
    Session.set('queryType', queryType);

    // fetch the first pair dropdowns values
    const selectedSourceId = $(event.target).closest('.query-box').find('.src-dropdown').val();
    const selectedSinkId = $(event.target).closest('.query-box').find('.sink-dropdown').val();

    callSouffleAndDisplayResults(queryType, selectedSourceId, selectedSinkId, selectedSecondSourceId, selectedSecondSinkId, null);
  },
  'change .second-sink-dropdown'(event) {
    console.log('2nd sink dropdown saw a value change');
    const selectedSecondSinkId = $(event.target).val();
    
    const selectedSecondSourceId = $(event.target).closest('.query-box').find('.second-src-dropdown').val();

    const queryType = $(event.target).closest('.query-box').attr('data-query');

    // write to session
    Session.set('selectedSecondSinkId', selectedSinkId);
    Session.set('queryType', queryType);

      // fetch the first pair dropdowns values
      const selectedSourceId = $(event.target).closest('.query-box').find('.src-dropdown').val();
      const selectedSinkId = $(event.target).closest('.query-box').find('.sink-dropdown').val();
  

    callSouffleAndDisplayResults(queryType, selectedSourceId, selectedSinkId, selectedSecondSourceId, selectedSecondSinkId, null);
  },

  'change .api-dropdown'(event) {
    const selectedAPIId = $(event.target).val();
    

    const queryType = $(event.target).closest('.query-box').attr('data-query');

    // write to session
    Session.set('selectedAPIId', selectedAPIId);
    Session.set('queryType', queryType);

    // fetch the first pair dropdowns values
    const selectedSourceId = $(event.target).closest('.query-box').find('.src-dropdown').val();
    const selectedSinkId = $(event.target).closest('.query-box').find('.sink-dropdown').val();


    callSouffleAndDisplayResults(queryType, selectedSourceId, selectedSinkId, null, null, selectedAPIId);
  },
});

Template.queries.onRendered(function() {
  this.findAll('.start,.end,.middle').forEach(function(element) {
    hljs.highlightBlock(element, { language: 'java' });
    element.innerHTML = element.innerHTML.replace(/---focus---/g, '<strong class="focus" style="background-color: red;color: white!important;">').replace(/---\/focus---/g, '</strong>');
  });
});
function fetchSinks(queryType, selectedSourceId) {
  let isReported = true;
  if (queryType === 'whynot_node_pairs' || queryType === 'whatif_relax') {
    // any 
    isReported = { $in: [false] };
  }

  // find all paths that have the selected source
  const paths = Paths.find({ 'left.nodeId': parseInt(selectedSourceId), 'reported': isReported }).fetch();
  // extract all sink nodeIds from the paths
  const sinks = paths.map(path => path.right.nodeId);

  return [...new Set(sinks)];
}

function fetchSources(queryType, selectedSinkId) {
  let isReported = true;
  if (queryType === 'whynot_node_pairs'  || queryType === 'whatif_relax') {
    // any 
    isReported = { $in: [true, false] };
  }

  // find all paths that have the selected sink
  const paths = Paths.find({ 'right.nodeId': parseInt(selectedSinkId), 'reported': isReported }).fetch();
  // extract all source nodeIds from the paths
  const sources = paths.map(path => path.left.nodeId);

  return [...new Set(sources)];
}

