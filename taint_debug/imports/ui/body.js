
import { Template } from 'meteor/templating';

import './body.html'; 
import { Paths } from '../api/paths.js';
import { QueryResults } from '../api/queryresults.js';
import './paths.js';


Template.body.helpers({
    message() {
        return "Hello!";
    },
    paths() {
        return Paths.find({}).fetch();   
    },
    pathsToDisplay() {
        // if no QueryResults, show 5
        // otherwise, show Paths containing the nodes in QueryResults
        console.log('pathsToDisplay() has been called');
        const selectedSinkId = Session.get('selectedSinkId');
        const selectedSourceId = Session.get('selectedSourceId');

        if (QueryResults.find({sourceId: selectedSourceId, sinkId: selectedSinkId}).count() === 0) {
            console.log('No query results found. Rendering any 5 paths.');
            return Paths.find({}, {limit: 5}).fetch();
        } else {
            console.log('Query results found. Rendering paths matching nodes found on the path.');
            var queryResults = QueryResults.find({sourceId: Session.get('selectedSourceId'), sinkId: Session.get('selectedSinkId')}).fetch()
            var queryResultsNodes = [];
            for (var i = 0; i < queryResults.length; i++) {
                // fetch nodes in nodesOnPath
                var nodesOnPath = queryResults[i].nodesOnPath;
                for (var j = 0; j < nodesOnPath.length; j++) {
                    queryResultsNodes.push(nodesOnPath[j]);
                }

            }
            // uhh, just find the paths with the matching sources and sinks
            // and then filter out the ones that don't have all the nodes in queryResultsNodes? (do we need to check for this?)

            var pathsToDisplay = Paths.find({"left.nodeId": parseInt(selectedSourceId), "right.nodeId": parseInt(selectedSinkId)}).fetch();

            console.log('output: pathsToDisplay', pathsToDisplay)
            return pathsToDisplay;

        }
    }
    

});