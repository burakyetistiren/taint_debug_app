import { Template } from 'meteor/templating';

Template.paths.helpers({
  message() {
    return "Welcome to the Paths page!";
  }
});
