import { Template } from 'meteor/templating';
import { Tracker } from 'meteor/tracker';
import { Session } from 'meteor/session';
import cytoscape from 'cytoscape';
import popper from 'cytoscape-popper';
import tippy from 'tippy.js';
import 'tippy.js/dist/tippy.css';
import { createPopper } from '@popperjs/core';

import { Paths, Libs, Nodes } from '../api/paths.js';

import './queries.html';
import './queries.js';
import './query.html';
import './query.js';
import './cytoscapeContainer.html';

window.Paths = Paths;
window.Libs = Libs;
window.Nodes = Nodes;
console.log('Paths:', Paths);

// Register the popper extension
cytoscape.use(popper);

function makeTippy(ele, text) {
  if (typeof ele.popperRef !== 'function') {
    console.error('popperRef is not defined on the element:', ele);
    return null;
  }

  var ref = ele.popperRef();
  var dummyDomEle = document.createElement('div');
  dummyDomEle.style.position = 'absolute';
  dummyDomEle.style.top = 0;
  dummyDomEle.style.left = 0;
  document.body.appendChild(dummyDomEle);

  return tippy(dummyDomEle, {
    getReferenceClientRect: ref.getBoundingClientRect,
    trigger: 'manual',
    content: () => {
      var div = document.createElement('div');
      div.innerHTML = text;
      return div;
    },
    arrow: true,
    placement: 'bottom',
    hideOnClick: false,
    sticky: 'reference',
    interactive: true,
    appendTo: document.body
  });
}

Meteor.startup(() => {
  const nodes = [];
  const edges = [];
  
  Meteor.defer(() => {
    Meteor.call('readGraphData', (error, result) => {
      return;
      if (error) {
        console.error('Error reading file:', error);
        return;
      }

      // Fetch the node type information
      Meteor.call('getFactNodes', (error, factNodes) => {
        if (error) {
          console.error('Error fetching fact nodes:', error);
          return;
        }

        // Convert every element in factNodes to string
        for (var key in factNodes) {
          factNodes[key] = factNodes[key].map(String);
        }

        const { sinks, sources, sanitizers, apis } = factNodes;
        console.log('Fact nodes:', factNodes);

        console.log('Sinks:', sinks);
        console.log('Sources:', sources);
        console.log('Sanitizers:', sanitizers);
        console.log('APIs:', apis);

        result.nodes.forEach(node => {
          const nodeId = node.nodeId.toString();
          let color = '#0074D9'; // Default color
          let textColor = '#FFFFFF'; // Default text color

          if (sinks.includes(nodeId)) {
            color = '#FF0000';
            console.log(`Node ${nodeId} is a sink, assigned color: red`);
          } else if (sources.includes(nodeId)) {
            color = '#FF8C00';
            console.log(`Node ${nodeId} is a source, assigned color: orange`);
          } else if (sanitizers.includes(nodeId)) {
            color = '#21d900';
            console.log(`Node ${nodeId} is a sanitizer, assigned color: green`);
          } else if (apis.includes(nodeId)) {
            color = '#FFFF00';
            console.log(`Node ${nodeId} is an API, assigned color: yellow`);
          }
          nodes.push({
          data: { id: 'node_' + nodeId, description: nodeId + ' ' + node.description, 'original-background-color': color, 'original-text-color': textColor},
            style: { 'background-color': color, 'color': textColor }
          });
        });
        console.log('Nodes:', nodes); 

        result.edges.forEach(edge => edges.push({
          data: { id: 'edge_' + edge.edgeId.toString(), source: 'node_' + edge.sourceId.toString(), target: 'node_' + edge.targetId.toString(), description: "Warning " + edge.warningNumber + " id:" + edge.edgeId }
        }));

        // Initialize Cytoscape with nodes and edges
        let cy = cytoscape({
          container: document.getElementById('cy'),
          style: [{
            selector: 'node',
            style: {
              'label': 'data(description)',
              'text-valign': 'center',
              'text-halign': 'center',
              'background-color': 'data(background-color)', // Use the dynamic background color
              'color': 'data(color)', // Use the dynamic text color
              'text-outline-width': 2,
              'text-outline-color': '#0074d9',
              'font-size': 12
            }
          }, {
            selector: 'edge',
            style: {
              'label': 'data(description)',
              'curve-style': 'bezier',
              'target-arrow-shape': 'triangle',
              'line-color': '#AAAAAA',
              'target-arrow-color': '#AAAAAA',
              'width': 2,
              'font-size': 10,
              'color': '#FFFFFF',
              'text-outline-width': 1,
              'text-outline-color': '#AAAAAA'
            }
          }, {
            selector: '.highlighted',
            style: {
              'background-color': '#FF0000',
              'color': '#FFFFFF',
              'text-outline-width': 2,
              'text-outline-color': '#FF0000'
            }
          }],
          elements: { nodes, edges },
          layout: {
            name: 'cose',
            animate: true,
            fit: true,
            padding: 30,
            randomize: true,
            nodeRepulsion: 400000,
            idealEdgeLength: 100,
            edgeElasticity: 100,
            gravity: 80,
            numIter: 1000,
            initialTemp: 200,
            coolingFactor: 0.95,
            minTemp: 1.0
          }
        });

        window.cyInstance = cy; // Expose Cytoscape instance globally

        // Function to reset all nodes and edges to their original colors
        function resetColors() {
          cy.nodes().forEach(node => {
            node.removeClass('highlighted');
            node.style('background-color', node.data('original-background-color'));
            node.style('color', node.data('original-text-color'));
          });
          cy.edges().removeClass('highlighted');
        }

        cy.on('tap', 'node', function(evt) {
          var node = evt.target;
          resetColors(); // Reset colors before highlighting the clicked node
          if (node.hasClass('highlighted')) {
            node.removeClass('highlighted');
            node.style('background-color', node.data('original-background-color')); // Revert to original color
            node.style('color', node.data('original-text-color')); // Revert to original text color
          } else {
            node.addClass('highlighted');
            node.style('background-color', '#808080'); // Change color to gray
            node.style('color', '#FFFFFF'); // Change text color to white
            cy.animate({
              center: { eles: node },
              zoom: 2
            }, {
              duration: 200
            });
          }
        
          // Scroll to the corresponding code snippet
          const nodeId = node.id().replace('node_', '');
          const elementToScrollTo = document.getElementById("node_" + nodeId);
          if (elementToScrollTo) {
            elementToScrollTo.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        
          console.log('tapped ' + node.id());
          console.log('node data:', node);
          console.log('edge data:', node._private.edges[0]._private.data.id);
        
          var referenceId = node._private.edges[0]._private.data.description;
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
        });
        
        
        
        cy.on('tap', 'edge', function(evt) {
          var edge = evt.target;
          resetColors(); // Reset colors before highlighting the clicked edge
          if (edge.hasClass('highlighted')) {
            edge.removeClass('highlighted');
          } else {
            edge.addClass('highlighted');
            cy.animate({
              center: { eles: edge },
              zoom: 2
            }, {
              duration: 200
            });
          }
          console.log('tapped ' + edge.id());
          console.log('edge data:', edge);

          var referenceId = edge.data('description');
          var warningNumber = referenceId.split(" ")[1];
          var elementToScrollTo = document.getElementById("warning_" + warningNumber);
          if (elementToScrollTo) {
            elementToScrollTo.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        });

        cy.on('tap', function(event) {
          if (event.target === cy) {
            resetColors();
          }
        });

        console.log('Cytoscape elements:', cy.elements().jsons());
      });
    });
  });
});
