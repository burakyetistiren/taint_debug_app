import { Template } from 'meteor/templating';
import { Paths, Libs, Edges, Nodes } from '../api/paths.js';
import { QueryResults } from '../api/queryresults.js';
import './queries.html';

function callSouffleAndDisplayResults(queryType, sourceId, sinkId, secondSourceId, secondSinkId, selectedAPIId) {
  console.log('Running query:', queryType, sourceId, sinkId);
  Meteor.call('runQuery', queryType, sourceId, sinkId, secondSourceId, secondSinkId, selectedAPIId, (error, result) => {
    if (error) {
      console.error('Error running query:', error);
    } else {
      console.log('Query result:', result);
    }
    
    const queryResults = QueryResults.findOne({ sourceId: sourceId, sinkId: sinkId });
    
    console.log('QueryResults:', queryResults);

    if (!queryResults) {
      console.error('No query results found');
      return;
    }

    const cy = window.cyInstance;
    
    const nodesToKeep = queryResults.nodesOnPath;
    const cyNodesToShow = [];
    
    nodesToKeep.forEach(nodeOnPathTuple => {
      const nodeId = nodeOnPathTuple[0];
      const libNode = nodeOnPathTuple[2];

      let color = '#0074D9';
      let textColor = '#FFFFFF';
      const node = Nodes.findOne({ nodeId: nodeId });

      if (nodeId === sourceId) {
        return;
      }
      if (libNode != -1) {
        color = '#FF851B';
      }
      

      cyNodesToShow.push({
        data: { id: 'node_' + nodeId, description: nodeId + ' ' + node.description, 'original-background-color': color, 'original-text-color': textColor },
        style: { 'background-color': color, 'color': textColor }
      });
    });

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

    const allEdges = Edges.find({}).fetch();
    const edgesToKeep = allEdges.filter(edge => 
      nodeIdsToKeep.includes('node_' + edge.sourceId) && nodeIdsToKeep.includes('node_' + edge.targetId)
    );

    cy.elements().remove();

    cy.add(cyNodesToShow);

    edgesToKeep.forEach(edge => {
      cy.add({
        group: 'edges',
        data: { source: 'node_' + edge.sourceId, target: 'node_' + edge.targetId }
      });
    });

    cy.layout({ name: 'cose' }).run();
  });
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
      if (error) {
        console.error('Error reading node mapping:', error);
        return;
      }

      nodeMapping = result;  // Store the node mapping globally

      Meteor.call('getFactNodes', (error, factNodesResult) => {
        if (error) {
          console.error('Error reading graph data:', error);
        } else {
          const nodes = factNodesResult.nodes.map(node => {
            const nodeId = node.nodeId;
            const nodeToAdd = nodeMapping[nodeId];

            if (!nodeToAdd) {
              console.error(`Node with ID ${nodeId} not found in nodeMapping`);
              return { id: nodeId, description: 'Unknown' };
            }

            nodeToAdd.file = nodeToAdd.file.split('/').pop();
            const nodeDescription = nodeToAdd.file + ", " + nodeToAdd.line + ", " + nodeToAdd.column + ", " + nodeToAdd.end_line + ", " + nodeToAdd.end_column + ", " + nodeToAdd.description || nodeId;
            return { id: nodeId, description: nodeDescription };
          });
          const edges = factNodesResult.edges.map(edge => ({
            id: edge.edgeId,
            description: edge.description,
          }));
          const sources = factNodesResult.sources.map(sourceId => {
            const nodeToAdd = nodeMapping[sourceId];
            nodeToAdd.file = nodeToAdd.file.split('/').pop();
            const sourceDescription = nodeToAdd.file + ", " + nodeToAdd.line + ", " + nodeToAdd.column + ", " + nodeToAdd.end_line + ", " + nodeToAdd.end_column + ", " + nodeToAdd.description || sourceId;
            return { id: sourceId, description: sourceDescription };
          });
          const sinks = factNodesResult.sinks.map(sinkId => {
            const nodeToAdd = nodeMapping[sinkId];
            nodeToAdd.file = nodeToAdd.file.split('/').pop();
            const sinkDescription = nodeToAdd.file + ", " + nodeToAdd.line + ", " + nodeToAdd.column + ", " + nodeToAdd.end_line + ", " + nodeToAdd.end_column + ", " + nodeToAdd.description || sinkId;
            return { id: sinkId, description: sinkDescription };
          });

          this.nodes.set(nodes);
          this.edges.set(edges);
          this.sources.set(sources);
          this.sinks.set(sinks);
          this.libraryNodes.set(factNodesResult.apis);
          this.libraries.set(factNodesResult.apiLibs);

          console.log('Library Nodes:', this.libraryNodes);
        }
      });
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

    callSouffleAndDisplayResults(queryType, selectedSourceId, selectedSinkId, selectedSecondSourceId, selectedSecondSinkId, selectedApiId);
  },
  'change .second-src-dropdown'(event) {
    const selectedSecondSourceId = $(event.target).val();
    const selectedSecondSinkId = $(event.target).closest('.query-box').find('.second-sink-dropdown').val();
    const queryType = $(event.target).closest('.query-box').attr('data-query');

    Session.set('selectedSecondSourceId', selectedSecondSourceId);
    Session.set('queryType', queryType);

    const selectedSourceId = $(event.target).closest('.query-box').find('.src-dropdown').val();
    const selectedSinkId = $(event.target).closest('.query-box').find('.sink-dropdown').val();

    callSouffleAndDisplayResults(queryType, selectedSourceId, selectedSinkId, selectedSecondSourceId, selectedSecondSinkId, null);
  },
  'change .second-sink-dropdown'(event) {
    const selectedSecondSinkId = $(event.target).val();
    const selectedSecondSourceId = $(event.target).closest('.query-box').find('.second-src-dropdown').val();
    const queryType = $(event.target).closest('.query-box').attr('data-query');

    Session.set('selectedSecondSinkId', selectedSecondSinkId);
    Session.set('queryType', queryType);

    const selectedSourceId = $(event.target).closest('.query-box').find('.src-dropdown').val();
    const selectedSinkId = $(event.target).closest('.query-box').find('.sink-dropdown').val();

    callSouffleAndDisplayResults(queryType, selectedSourceId, selectedSinkId, selectedSecondSourceId, selectedSecondSinkId, null);
  },
  'change .api-dropdown'(event) {
    const selectedAPIId = $(event.target).val();
    const queryType = $(event.target).closest('.query-box').attr('data-query');

    Session.set('selectedAPIId', selectedAPIId);
    Session.set('queryType', queryType);

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
    isReported = { $in: [false] };
  }

  const paths = Paths.find({ 'left.nodeId': parseInt(selectedSourceId), 'reported': isReported }).fetch();
  const sinks = paths.map(path => path.right.nodeId);

  return [...new Set(sinks)].map(sinkId => {
    const nodeToAdd = nodeMapping[sinkId];
    if (!nodeToAdd) {
      console.error(`Node with ID ${sinkId} not found in nodeMapping`);
      return { id: sinkId, description: 'Unknown' };
    }
    nodeToAdd.file = nodeToAdd.file.split('/').pop();
    const sinkDescription = nodeToAdd.file + ", " + nodeToAdd.line + ", " + nodeToAdd.column + ", " + nodeToAdd.end_line + ", " + nodeToAdd.end_column + ", " + nodeToAdd.description || sinkId;
    return { id: sinkId, description: sinkDescription };
  });
}

function fetchSources(queryType, selectedSinkId) {
  let isReported = true;
  if (queryType === 'whynot_node_pairs' || queryType === 'whatif_relax') {
    isReported = { $in: [true, false] };
  }

  const paths = Paths.find({ 'right.nodeId': parseInt(selectedSinkId), 'reported': isReported }).fetch();
  const sources = paths.map(path => path.left.nodeId);

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
}