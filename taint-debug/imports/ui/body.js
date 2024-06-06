
import { Template } from 'meteor/templating';

import './body.html'; 
import { Paths } from '../api/paths.js';
import './paths.js';


Template.body.helpers({

    message() {
        return "Hello!";
    },
    paths() {
        return Paths.find({}).fetch();   
    }
    

});