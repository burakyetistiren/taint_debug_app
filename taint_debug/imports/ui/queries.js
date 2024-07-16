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
    cy.elements().removeClass('highlighted');
    const selectedNode = cy.getElementById('node_' + selectedNodeId);
    selectedNode.addClass('highlighted');
    cy.animate({
      center: { eles: selectedNode },
      zoom: 2 // You can adjust the zoom level as needed
    }, {
      duration: 1000 // Animation duration in milliseconds
    });
  },
  'change .focus-dropdown-edge'(event) {
    const selectedEdgeId = event.target.value;
    const cy = window.cyInstance; // Access the Cytoscape instance
    cy.elements().removeClass('highlighted');
    const selectedEdge = cy.getElementById('edge_' + selectedEdgeId);
    selectedEdge.addClass('highlighted');
    cy.animate({
      center: { eles: selectedEdge },
      zoom: 2 // You can adjust the zoom level as needed
    }, {
      duration: 1000 // Animation duration in milliseconds
    });
  }
});

Template.queries.onRendered(function() {
  this.findAll('.start,.end,.middle').forEach(function(element) {
    hljs.highlightBlock(element, { language: 'java' });
    element.innerHTML = element.innerHTML.replace(/---focus---/g, '<strong class="focus" style="background-color: red;color: white!important;">').replace(/---\/focus---/g, '</strong>');
  });
});
