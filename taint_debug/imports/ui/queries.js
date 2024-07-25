import { Template } from 'meteor/templating';
import { Paths, Libs, Nodes } from '../api/paths.js';
import './queries.html';


function callSouffleAndDisplayResults(queryType, sourceId, sinkId) {
  console.log('Running query:', queryType, sourceId, sinkId);
  Meteor.call('runQuery', queryType, sourceId, sinkId, (error, result) => {
    if (error) {
      console.error('Error running query:', error);
    } else {
      console.log('Query result:', result);
    }
  });
}

Template.queries.onCreated(function() {
  this.nodes = new ReactiveVar([]);
  this.edges = new ReactiveVar([]);
  this.sources = new ReactiveVar([]);
  this.sinks = new ReactiveVar([]);
  this.libraryNodes = new ReactiveVar([]);
  
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
        this.libraryNodes.set(result.libraryNodes);
      }
    });
  });
});

Template.queries.helpers({
  queries() {
    return [
      { description: "WhyFlow: Tracking data flows from", queryType: "why_node_pair" },
      { description: "WhyNotFlow: Identifying sanitizers that remove data flows from", queryType: "whynot" },
      { description: "CommonFlows: Common API usages between different flow paths from", queryType: "common"}
    ];
  },
  sources() {
    // ####### HJ TODO: #######
    // const paths = Paths.find().fetch();
    // const sources = paths.map(path => path.left.nodeId);
    // return [...new Set(sources)];
    return Template.instance().sources.get();
  },
  sinks() {
    // // ####### HJ TODO: #######
    // const paths = Paths.find().fetch();
    // const sinks = paths.map(path => path.right.nodeId);
    // return [...new Set(sinks)];
    return Template.instance().sinks.get();
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
    callSouffleAndDisplayResults(queryType, selectedSourceId, selectedSinkId);
    
    
  },
  'change .sink-dropdown'(event) {
    console.log('a sink dropdown saw a value change');
    const selectedSinkId = $(event.target).val();
    
    const selectedSourceId = $(event.target).closest('.query-box').find('.src-dropdown').val();

    const queryType = $(event.target).closest('.query-box').attr('data-query');
    callSouffleAndDisplayResults(queryType, selectedSourceId, selectedSinkId);

  },
});

Template.queries.onRendered(function() {
  this.findAll('.start,.end,.middle').forEach(function(element) {
    hljs.highlightBlock(element, { language: 'java' });
    element.innerHTML = element.innerHTML.replace(/---focus---/g, '<strong class="focus" style="background-color: red;color: white!important;">').replace(/---\/focus---/g, '</strong>');
  });
});
