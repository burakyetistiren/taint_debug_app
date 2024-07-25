import { Meteor } from 'meteor/meteor';
import '../imports/ui/app.js';
import '../imports/ui/body.js';
import '../imports/ui/paths.js';
import '../imports/ui/jsonView.js';
import '../imports/ui/queries.js';



Meteor.startup(() => {
  // Initialization code, if needed
});


Template.body.helpers({
  message() {
      return "Hello!";
  }

});
