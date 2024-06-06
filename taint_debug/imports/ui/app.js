import cytoscape from 'cytoscape';
import popper from 'cytoscape-popper';
import tippy from 'tippy.js';
import 'tippy.js/dist/tippy.css';
import { createPopper } from '@popperjs/core';

import { Paths, Libs, Nodes } from '../api/paths.js';

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
  if (!ref) {
    console.error('popperRef returned undefined for the element:', ele);
    return null;
  }

  console.log('Creating tippy for element:', ele);

  var dummyDomEle = document.createElement('div');
  dummyDomEle.style.position = 'absolute';
  dummyDomEle.style.top = 0;
  dummyDomEle.style.left = 0;
  document.body.appendChild(dummyDomEle);

  var tip = tippy(dummyDomEle, {
    getReferenceClientRect: ref.getBoundingClientRect,
    trigger: 'manual',
    content: function() {
      var div = document.createElement('div');
      div.innerHTML = text;
      return div;
    },
    arrow: true,
    placement: 'bottom',
    hideOnClick: false,
    sticky: 'reference',
    interactive: true,
    appendTo: document.body,
    onCreate(instance) {
      console.log('Tippy instance created:', instance);
    },
    onShow(instance) {
      console.log('Tippy instance shown:', instance);
    },
  });

  console.log('Created tippy instance:', tip);

  return tip;
}





Meteor.startup(() => {
  const nodes = [];
  const edges = [];
  const nodesSet = new Set();
  
  Meteor.defer(() => {
  Meteor.call('readGraphData', (error, result) => {
    
    if (error) {
      console.error('Error reading file:', error);
    } else {
      console.log('File contents:', result);

      for (let i = 0; i < result.edges.length ; i++) {        
          const edge = result.edges[i];
          let warningNumber = edge.warningNumber;
          edges.push({ data: { id: 'edge_' + edge.edgeId.toString() , source: 'node_' + edge.sourceId.toString(), target: 'node_' + edge.targetId.toString(), description: "Warning " + warningNumber + " id:" +edge.edgeId } });    
      }

      result.nodes.forEach(node => {
        nodes.push({ data: { id: 'node_' + node.nodeId.toString(), description: node.description } });
      });

      console.log('Nodes:', nodes);
      console.log('Edges:', edges);

      // Initialize Cytoscape after data is ready
      let cy = cytoscape({
        container: document.getElementById('cy'),
        style: [
          {
            selector: 'node',
            style: {
              'label': 'data(description)',
              'text-valign': 'center',
              'text-halign': 'center',
              'background-color': '#0074D9',
              'color': '#FFFFFF',
              'text-outline-width': 2,
              'text-outline-color': '#0074D9',
              'font-size': 12,
            }
          },
          {
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
              'text-outline-color': '#AAAAAA',
            }
          }
        ],
        elements: {
          nodes: nodes,
          edges: edges
        },
        layout: {
          name: 'cose', // Change layout to the desired one
          animate: true, // Enable animations
          fit: true, // Fit the viewport to the elements
          padding: 30, // Padding around the layout
          randomize: true, // Randomize the initial positions
          nodeRepulsion: 400000, // Node repulsion (non-overlapping)
          idealEdgeLength: 100, // Ideal edge (non-overlapping) length
          edgeElasticity: 100, // Edge elasticity
          gravity: 80, // Gravity force
          numIter: 1000, // Number of iterations to resolve the layout
          initialTemp: 200, // Initial temperature for cooling
          coolingFactor: 0.95, // Cooling factor
          minTemp: 1.0 // Minimum temperature for cooling
        }
      });

      cy.on( 'tap', 'node', function(){
        var node = this;
        console.log( 'tapped ' + node.id() );
      });

      // Log Cytoscape elements to verify all nodes and edges
      console.log('Cytoscape elements:', cy.elements().jsons());

      /** 
      // Apply tippy to all nodes and edges
      cy.nodes().forEach(node => {
        var tippyInstance = makeTippy(node, node.id());
        if (tippyInstance) {
          console.log('Showing tippy for node:', node.id());
          tippyInstance.show();
        }
      });

      cy.edges().forEach(edge => {
        var tippyInstance = makeTippy(edge, edge.id());
        if (tippyInstance) {
          console.log('Showing tippy for edge:', edge.id());
          tippyInstance.show();
        }
      });
      */
      }
    });
  });
});
