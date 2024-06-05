import { Template } from 'meteor/templating';
import { ReactiveDict } from 'meteor/reactive-dict';
import { Session } from 'meteor/session';

import './body.html'; 
import '../imports/ui/paths.js';



Template.body.helpers({
    message() {
        return "Hello!";
    }

});
