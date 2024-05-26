import { Meteor } from 'meteor/meteor';
import fs from 'fs';
import path from 'path';


Meteor.startup(() => {
  // code to run on server at startup
});

Meteor.methods({
  readFileContents(filePath) {
    var file = fs.readFileSync(filePath, 'utf8');
    return file;
  }
});