import { Template } from 'meteor/templating';
import { Tracker } from 'meteor/tracker';
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
      if (error) {
        console.error('Error reading file:', error);
        return;
      }

      console.log('File contents:', result);
      result.nodes.forEach(node => nodes.push({
        data: { id: 'node_' + node.nodeId.toString(), description: node.nodeId.toString() + ' ' + node.description }
      }));
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
            'background-color': '#0074D9',
            'color': '#FFFFFF',
            'text-outline-width': 2,
            'text-outline-color': '#0074D9',
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

      cy.on('tap', 'node', function(evt) {
        var node = evt.target;
        if (node.hasClass('highlighted')) {
          node.removeClass('highlighted');
        } else {
          cy.elements().removeClass('highlighted'); // Remove highlights from other nodes and edges
          node.addClass('highlighted');
          cy.animate({
            center: { eles: node },
            zoom: 2
          }, {
            duration: 1000
          });
        }
        console.log('tapped ' + node.id());
        console.log('node data:', node);

        var referenceId = node.data('description');
        var warningNumber = referenceId.split(" ")[1];
        var elementToScrollTo = document.getElementById("warning_" + warningNumber);
        if (elementToScrollTo) {
          elementToScrollTo.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });

      cy.on('tap', 'edge', function(evt) {
        var edge = evt.target;
        if (edge.hasClass('highlighted')) {
          edge.removeClass('highlighted');
        } else {
          cy.elements().removeClass('highlighted'); // Remove highlights from other nodes and edges
          edge.addClass('highlighted');
          cy.animate({
            center: { eles: edge },
            zoom: 2
          }, {
            duration: 1000
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

      console.log('Cytoscape elements:', cy.elements().jsons());
    });
  });
});
