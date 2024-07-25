import jsonview from '@pgrabovets/json-view';
import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';
import './jsonView.html';

Template.jsonView.onCreated(function() {
  this.jsonData = new ReactiveVar(null);

  Meteor.call('readDataflowJson', (error, result) => {
    if (error) {
      console.error('Error reading dataflow JSON:', error);
    } else {
      this.jsonData.set(result);
    }
  });
});

Template.jsonView.onRendered(function() {
  this.autorun(() => {
    const jsonData = Template.instance().jsonData.get();
    if (jsonData) {
      const tree = jsonview.create(JSON.stringify(jsonData));
      jsonview.render(tree, document.getElementById('json-view'));
      jsonview.expand(tree);
    }
  });
});

Template.jsonView.events({
  'click #toggle-json-view'(event) {
    const jsonView = document.getElementById('json-view');
    const button = event.target;
    if (jsonView.style.display === 'none') {
      jsonView.style.display = 'block';
      button.innerHTML = 'Collapse JSON View';
    } else {
      jsonView.style.display = 'none';
      button.innerHTML = 'Expand JSON View';
    }
  }
});
