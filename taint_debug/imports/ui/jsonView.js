import jsonview from '@pgrabovets/json-view';
import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
import './jsonView.html';

Meteor.startup(() => {
  // Function to fetch JSON data and render it
  function renderJsonView(data) {
    // Create JSON tree object
    const tree = jsonview.create(data);
    
    // Render JSON tree into DOM element
    const container = document.querySelector('.json-view-container');
    if (container) {
      jsonview.render(tree, container);
      jsonview.expand(tree);
    }
  }

  // Fetch JSON data from the server
  Meteor.call('readDataflowJson', function(error, result) {
    if (error) {
      console.error('Error fetching JSON data:', error);
      return;
    }

    // Render JSON view
    renderJsonView(JSON.stringify(result));
  });
});
