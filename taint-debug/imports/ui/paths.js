import { Template } from 'meteor/templating';
import { Session } from 'meteor/session';

import { Paths, Libs, Nodes } from '../api/paths.js';

import hljs from 'highlight.js'
import 'highlight.js/styles/github-dark.css'
import javascript from 'highlight.js/lib/languages/javascript';


import './paths.html';


// misc helpers
function isViewingLibraryImpact() {
  // if Session.get('inspectedLib')  matches an lib in the current inspected warning
  const path = Paths.findOne(Session.get('inspectedWarning'));
  if (!path) {
    return false;
  }
  const hasMatch = path.middle.some(node => node.lib == Session.get('inspectedLib'));
  if (hasMatch){
     return true;
  } {
    return false;
  }
}

Template.path.helpers({
  start() {
    return this.left.code;
  },

  
  topIntermediateCode() {
    return this.middle? this.middle[0].code: null;
  },

  end() {
    return this.right.code;
  },

  isCurrentlyInspectedWarning() {
    return Session.get('inspectedWarning') == this._id;
  },

  isViewingWhyNodeModel() {
    return Session.get('whyNodeModel') == this._id;
  },
  isCurrentInspectedWarningAndViewingLibraryImpact() {
    return isViewingLibraryImpact() && Session.get('inspectedWarning') == this._id;
  },

  


});

Template.path.events({
  'click #inspectButton'(event) {
    Session.set('inspectedWarning', this._id);
    
  }
});



Template.path.onRendered(function() {

  // hljs on the left, right
  hljs.highlightBlock(this.find('.start'), {language: 'java'});
  this.findAll('.middle').forEach(function(middle) {
    hljs.highlightBlock(middle);
  });
  hljs.highlightBlock(this.find('.end'), {language: 'java'});
   // replace <focus> in the content of the .start blocks with <strong>
  this.findAll('.start,.end,.middle').forEach(function(start) {
    start.innerHTML = start.innerHTML.replace(/---focus---/g, '<strong class="focus" style="background-color: red;color: white!important;">').replace(/---\/focus---/g, '</strong>');   
  });
  

});


Template.intermediateNodes.helpers({
  intermediates() {
      // fetch the current inspected path
    const path = Paths.findOne(Session.get('inspectedWarning'));
    return path? path.middle: [];

  },

  colorBorder() {
    if (this.lib == -1) {
      return 'no-border';
    }
    const libNode = Libs.findOne({libId: this.lib});
    // if importance < 0.5, green
    // if > 0.5 but less 1.5, yellow
    // if > 1.5 but less 2.5, orange
    // if > 2.5, red

    if (libNode.importance < 0.5) {
      return 'green-border';
    } else if (libNode.importance < 1.5) {
      return 'yellow-border';
    } else if (libNode.importance < 2.5) {
      return 'orange-border';
    } else {
      return 'red-border';
    }

  },

  libId   () {

    return this.lib;
  },

  libname() {
    if (this.lib == -1) {
      return '';
    }
    const libNode = Libs.findOne({libId: this.lib});
    return libNode.name;
  },

  showIfHasLib() {
    return this.lib != -1? '': 'hidden';
  }


});

Template.intermediateNodes.events({

  'click .lib_impact'(event) {
    const libId = $(event.target).attr('data-libId');
    Session.set('inspectedLib', parseInt(libId));
  }
});

Template.intermediateNodes.onRendered(function() {
  this.findAll('.middle').forEach(function(middle) {
    hljs.highlightBlock(middle, {language: 'java'});
  });
  this.findAll('.start,.end,.middle').forEach(function(start) {
    start.innerHTML = start.innerHTML.replace(/---focus---/g, '<strong class="focus" style="background-color: red;color: white!important;">').replace(/---\/focus---/g, '</strong>');   
  });
}
);

Template.questionChoices.helpers({
  isOrIsNot() {
    return 'is';
  },
  start() {
    // return the current inspected path
    const path = Paths.findOne(Session.get('inspectedWarning')).left;
    return path? path.description: '';
  },
  end() {
    const path = Paths.findOne(Session.get('inspectedWarning')).right;
    return path? path.description: '';

  }
});

Template.questionChoices.events({
  'click .why_node_model'(event) {
    
    // const path = Paths.findOne(Session.get('inspectedWarning'));
    Session.set('whyNodeModel', Session.get('inspectedWarning'));
   
  }
});

Template.libraryImpact.helpers({

  displaySelectedLibNode() {
    const libNode = Libs.findOne({libId: Session.get('inspectedLib')});
    return libNode? libNode.name: '';
  },

  paths() {
    const libNode = Libs.findOne({libId: Session.get('inspectedLib')});
    var results = [];
    // enumerate over zip(libNode.sources and libNode.sinks)
    if (libNode) {
      for (var i = 0; i < libNode.sources.length; i++) {
        results.push({start: libNode.sources[i], end: libNode.sinks[i]});
      }
    }
    return results;
  },



});

Template.sourceSinkPair.helpers({
  codeFromNode(nodeId) {
    return Nodes.findOne({nodeId: nodeId}).code;
  }

});

Template.sourceSinkPair.onRendered(function() {

  // hljs on the left, right
  hljs.highlightBlock(this.find('.start'), {language: 'java'});
  this.findAll('.middle').forEach(function(middle) {
    hljs.highlightBlock(middle);
  });
  hljs.highlightBlock(this.find('.end'), {language: 'java'});
   // replace <focus> in the content of the .start blocks with <strong>
  this.findAll('.start,.end,.middle').forEach(function(start) {
    start.innerHTML = start.innerHTML.replace(/---focus---/g, '<strong class="focus" style="background-color: red;color: white!important;">').replace(/---\/focus---/g, '</strong>');   
  });
  

});