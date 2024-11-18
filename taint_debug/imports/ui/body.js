
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
            console.log('Query results found. Rendering paths containing nodes in query results.');
            var queryResults = QueryResults.find({}).fetch();
            var queryResultsNodes = [];
            for (var i = 0; i < queryResults.length; i++) {
                // fetch nodes in nodesOnPath
                var nodesOnPath = queryResults[i].nodesOnPath;
                for (var j = 0; j < nodesOnPath.length; j++) {
                    queryResultsNodes.push(nodesOnPath[j]);
                }

            }

            var pathsToDisplay = [];
            var paths = Paths.find({}).fetch();
            for (var i = 0; i < paths.length; i++) {
                // concat path.left.nodeId, path.right.nodeId, each of nodeIds in path.middle
                var nodesOnPath = [];
                nodesOnPath.push(paths[i].left.nodeId);
                nodesOnPath.push(paths[i].right.nodeId);
                var middleNodes = paths[i].middle;
                for (var j = 0; j < middleNodes.length; j++) {
                    nodesOnPath.push(middleNodes[j].nodeId);
                }
                // check if nodesOnPath contains any queryResultsNodes
                var containsAny = false;
                for (var j = 0; j < queryResultsNodes.length; j++) {
                    if (nodesOnPath.includes(queryResultsNodes[j][0])) {
                        containsAny = true;
                        break;
                    }
                }
                if (containsAny) {
                    pathsToDisplay.push(paths[i]);

                }
                
            }
            return pathsToDisplay;

        }
    }
    

});