import { Template } from 'meteor/templating';
import { Tracker } from 'meteor/tracker';
import { Session } from 'meteor/session';
import cytoscape from 'cytoscape';
import popper from 'cytoscape-popper';
import tippy from 'tippy.js';
import 'tippy.js/dist/tippy.css';
import { createPopper } from '@popperjs/core';

import { Paths, Libs, Nodes, Sources, Sinks } from '../api/paths.js';
import { QueryResults } from '../api/queryresults.js';

import './queries.html';
import './queries.js';
import './query.html';
import './query.js';
import './cytoscapeModal.html';
import './body.html';

window.Paths = Paths;
window.Libs = Libs;
window.Nodes = Nodes;
window.Sources = Sources;
window.Sinks = Sinks;
window.QueryResults = QueryResults;
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

function convertToString(value) {
  if (Array.isArray(value)) {
    return value.map(String);
  } else if (typeof value === 'object' && value !== null) {
    const result = {};
    for (const key in value) {
      result[key] = convertToString(value[key]);
    }
    return result;
  } else {
    return String(value);
  }
}

function openGraphPopup() {
  // Open the popup window and set dimensions
  const popup = window.open('/cytoscapePopup.html', 'GraphPopup', 'width=800,height=600');

  // Check if popup opened successfully
  if (!popup) {
    console.error("Popup could not be opened. Check if popups are blocked.");
    return;
  }

  // Wait until the popup's DOM is fully loaded
  popup.onload = function () {
    const intervalId = setInterval(() => {
      const cyContainer = popup.document.getElementById('cy');
      if (cyContainer) {
        // Once the container is found, initialize Cytoscape
        clearInterval(intervalId);

        const cy = cytoscape({
          container: cyContainer, // Set the container in the popup
          elements: { nodes, edges}, // Use nodes and edges from your data
          style: [
            {
              selector: 'node',
              style: {
                'label': 'data(var)',
                'text-valign': 'center',
                'text-halign': 'center',
                'background-color': 'data(background-color)', 
                'color': 'data(color)',
                'text-outline-width': 2,
                'text-outline-color': '#0074d9',
                'font-size': 12
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
                'text-outline-color': '#AAAAAA'
              }
            }
          ],
          layout: {
            name: 'breadthfirst',
            animate: true,
            fit: true,
            padding: 30,
            directed: true,
            spacingFactor: 1.5,
            nodeDimensionsIncludeLabels: true,
            avoidOverlap: true
          }
        });

        popup.cyInstance = cy; // Make cy instance available for debugging
      }
    }, 100); // Check every 100ms until cyContainer is found
  };
}


Template.mainTemplate.events({
  'click #openGraphButton': function () {
    openGraphPopup();
  }
});

let nodes = [];
let edges = [];

Meteor.startup(() => {
  nodes = [];
  edges = [];

  Meteor.defer(() => {
    // Fetch the node mapping
    Meteor.call('readNodeNames', (error, nodeMapping) => {
      if (error) {
        console.error('Error fetching node mapping:', error);
        return;
      }

      // Fetch the graph data
      Meteor.call('readGraphData', (error, result) => {
        if (error) {
          console.error('Error reading graph data:', error);
          return;
        }

        // Fetch the node type information
        Meteor.call('getFactNodes', (error, factNodes) => {
          if (error) {
            console.error('Error fetching fact nodes:', error);
            return;
          }

          // Convert every element in factNodes to string
          console.log('Fact nodes:', factNodes);
          for (const key in factNodes) {
            try {
              factNodes[key] = convertToString(factNodes[key]);
            } catch (e) {
              console.log('Error converting to string:', e);
            }
          }

          const { sinks, sources, sanitizers, apiNodes, apiLibs } = factNodes;
          console.log('Fact nodes:', factNodes);

          console.log('Sinks:', sinks);
          console.log('Sources:', sources);
          console.log('Sanitizers:', sanitizers);
          console.log('APIs:', apiNodes);

          /** 
          Object.keys(result.nodes).forEach(nodeId => {
            const node = result.nodes[nodeId];
            let color = '#0074D9'; // Default color
            let textColor = '#FFFFFF'; // Default text color

            if (sinks.includes(nodeId)) {
              color = '#FF0000';
              //console.log(`Node ${nodeId} is a sink, assigned color: red`);
            } else if (sources.includes(nodeId)) {
              color = '#FF8C00';
              //console.log(`Node ${nodeId} is a source, assigned color: orange`);
            } else if (sanitizers.includes(nodeId)) {
              color = '#21d900';
              //console.log(`Node ${nodeId} is a sanitizer, assigned color: green`);
            } else if (apiNodes.includes(nodeId)) {
              color = '#FFFF00';
              //console.log(`Node ${nodeId} is an API, assigned color: yellow`);
            }

            // Use the node description from the mapping
            const nodeToAdd = nodeMapping[nodeId];
            const firstIndex = nodeToAdd.file.indexOf("/src/main/java/");
            const secondIndex = nodeToAdd.file.indexOf("/src/main/java/", firstIndex + 1);
          
            // If there is a second occurrence, get the substring from that point onward
            if (secondIndex !== -1) {
              const targetPath = nodeToAdd.file.substring(secondIndex + "/src/main/java/".length);
              nodeToAdd.file = targetPath.replace(/\//g, ".");
            }
            const nodeDescription = nodeToAdd.file + ", " + nodeToAdd.description || nodeId;

            nodes.push({
              data: { id: 'node_' + nodeId, description: nodeDescription, 'original-background-color': color, 'original-text-color': textColor },
              style: { 'background-color': color, 'color': textColor }
            });
          });
          */
          // For easy debugging, limit to only nodes under 100
          //nodes = nodes.filter(node => parseInt(node.data.id.replace('node_', '')) < 500);

          console.log('Nodes:', nodes);

          result.edges
            // For easy debugging, limit to only nodes under 100
            //.filter(edge => parseInt(edge.sourceId) < 500 && parseInt(edge.targetId) < 500)
            .forEach(edge => edges.push({
              data: { id: 'edge_' + edge.edgeId.toString(), source: 'node_' + edge.sourceId.toString(), target: 'node_' + edge.targetId.toString(), description: "Warning " + edge.warningNumber + " id:" + edge.edgeId }
            }));   
            
          console.log('Edges:', edges);
        });
      });
    });
  });
});
