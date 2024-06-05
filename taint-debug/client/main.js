import { Meteor } from 'meteor/meteor';
import '../imports/ui/app.js';
import '../imports/ui/body.js';


Meteor.startup(() => {
  // Initialization code, if needed
});


Template.body.helpers({
  message() {
      return "Hello!";
  }

});
