import { Template } from 'meteor/templating';
import { Paths, Libs, Nodes } from '../api/paths.js';
import './queries.html';

Template.queries.onCreated(function() {
  this.nodes = new ReactiveVar([]);
  this.edges = new ReactiveVar([]);
  
  Meteor.call('readGraphData', (error, result) => {
    if (error) {
      console.error('Error reading graph data:', error);
    } else {
      const nodes = result.nodes.map(node => node.nodeId);
      const edges = result.edges.map(edge => edge.edgeId);
      this.nodes.set(nodes);
      this.edges.set(edges);
    }
  });
});

Template.queries.helpers({
  queries() {
    return [
      { description: "WhyFlow: Tracking data flows from" },
      { description: "WhyNotFlow: Identifying sanitizers that remove data flows from" },
      { description: "CommonFlows: Common API usages between different flow paths from" }
    ];
  },
  sources() {
    const paths = Paths.find().fetch();
    const sources = paths.map(path => path.left.nodeId);
    return [...new Set(sources)];
  },
  sinks() {
    const paths = Paths.find().fetch();
    const sinks = paths.map(path => path.right.nodeId);
    return [...new Set(sinks)];
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
  }
});

Template.queries.onRendered(function() {
  this.findAll('.start,.end,.middle').forEach(function(element) {
    hljs.highlightBlock(element, { language: 'java' });
    element.innerHTML = element.innerHTML.replace(/---focus---/g, '<strong class="focus" style="background-color: red;color: white!important;">').replace(/---\/focus---/g, '</strong>');
  });
});
