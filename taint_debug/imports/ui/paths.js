import { Template } from 'meteor/templating';
import { Session } from 'meteor/session';

import { Paths, Libs, Nodes } from '../api/paths.js';

import hljs from 'highlight.js';
import 'highlight.js/styles/github-dark.css';
import javascript from 'highlight.js/lib/languages/javascript';

import './paths.html';

// Misc helpers
function isViewingLibraryImpact() {
  // If Session.get('inspectedLib') matches a lib in the current inspected warning
  const path = Paths.findOne(Session.get('inspectedWarning'));
  if (!path) {
    return false;
  }
  const hasMatch = path.middle.some(node => node.lib == Session.get('inspectedLib'));
  return hasMatch;
}

Template.path.helpers({
  warningDescription() {
    // Give information about where the path starts and ends
    return this.left.description + ' to ' + this.right.description;
  },
  start() {
    // return this.left.code;
    // console.log(this.left.nodeId);
    var node = Nodes.findOne({ nodeId: this.left.nodeId });
    var retVal = node?.code
    console.log('=====start=====');
    console.log(this.left.nodeId)
    console.log(retVal);
    return retVal;
  },
  startNodeId() {
    return this.left.nodeId;
  },
  topIntermediateCode() {
    return this.middle ? this.middle[0].code : null;
  },
  numIntermediate() {
    return this.middle ? this.middle.length : 0;
  },
  end() {
    // return this.right.code;
    // return Nodes.findOne({ nodeId: this.right.nodeId }).code;
    var node = Nodes.findOne({ nodeId: this.right.nodeId });
    var retVal = node?.code;
    console.log('=====end=====');
    console.log(this.right.nodeId);
    console.log(retVal);
    return retVal;
  },
  endNodeId() {
    return this.right.nodeId;
  },
  isCurrentlyInspectedWarning() {
    return Session.get('inspectedWarning') == this._id;
  },
  isViewingWhyNodeModel() {
    return Session.get('whyNodeModel') == this._id;
  },
  showLibraryImpact() {
    return isViewingLibraryImpact() && Session.get('whyNodeModel') == this._id && Session.get('inspectedWarning') == this._id;
  },
  isReported() {  
    return this.reported ? '' : '<em>Unreported</em>';
  }
});

Template.path.events({
  'click #inspectButton'(event) {
    console.log('Inspecting warning:', this); 
    Session.set('inspectedWarning', this._id);
  },
'click #collapse-button-container'(event) {
  console.log('pathContent_' + this.warningNumber);
  const pathContent = document.getElementById('pathContent_' + this.warningNumber);
  console.log(this);
  const collapseButton = document.getElementById('collapse-button_' + this.warningNumber);

  if (pathContent.style.display === 'none') {
    pathContent.style.display = 'block';
    collapseButton.innerHTML = 'Collapse';
  } else {
    pathContent.style.display = 'none';
    collapseButton.innerHTML = 'Expand';
  }

  
    //  hljs on the left, right
    // get child with class start from pathContent
    var pathContentElement = document.getElementById('pathContent_' + this.warningNumber);
    var startchild = pathContentElement.getElementsByClassName('start')[0];
    hljs.highlightBlock(startchild, { language: 'java' });

    var allMiddles = pathContentElement.getElementsByClassName('middle');
    for (var i = 0; i < allMiddles.length; i++) {
      hljs.highlightBlock(allMiddles[i], { language: 'java' });
      allMiddles[i].innerHTML = start.innerHTML.replace(/---focus---/g, '<strong class="focus" style="background-color: red;color: white!important;">').replace(/---\/focus---/g, '</strong>');
    }
  
    var endchild = pathContentElement.getElementsByClassName('end')[0];
    hljs.highlightBlock(endchild, { language: 'java' });
    // Replace <focus> in the content of the .start,.end blocks with <strong>
    
      startchild.innerHTML = startchild.innerHTML.replace(/---focus---/g, '<strong class="focus" style="background-color: red;color: white!important;">').replace(/---\/focus---/g, '</strong>');
      endchild.innerHTML = endchild.innerHTML.replace(/---focus---/g, '<strong class="focus" style="background-color: red;color: white!important;">').replace(/---\/focus---/g, '</strong>');

    

  // hljs.highlightBlock(this.find('.start'), { language: 'java' });
  // Replace <focus> in the content of the .start blocks with <strong>
  // $(pathContent).findAll('.start,.end,.middle').forEach(function(start) {
  //   start.innerHTML = start.innerHTML.replace(/---focus---/g, '<strong class="focus" style="background-color: red;color: white!important;">').replace(/---\/focus---/g, '</strong>');
  // });
  
}

});

Template.path.onRendered(function() {

  // hljs on the left, right
  // hljs.highlightBlock(this.find('.start'), { language: 'java' });
  // this.findAll('.middle').forEach(function(middle) {
  //   hljs.highlightBlock(middle, { language: 'java' });
  // });
  // hljs.highlightBlock(this.find('.end'), { language: 'java' });
  // Replace <focus> in the content of the .start blocks with <strong>
  // this.findAll('.start,.end,.middle').forEach(function(start) {
  //   start.innerHTML = start.innerHTML.replace(/---focus---/g, '<strong class="focus" style="background-color: red;color: white!important;">').replace(/---\/focus---/g, '</strong>');
  // });
});

Template.intermediateNodes.helpers({
  intermediates() {
    // Fetch the current inspected path
    const path = Paths.findOne(Session.get('inspectedWarning'));
    return path ? path.middle : [];
  },
  colorBorder() {
    if (this.lib == -1) {
      return 'no-border';
    }
    const libNode = Libs.findOne({ libId: this.lib });
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
  libId() {
    return this.lib;
  },
  libname() {
    if (this.lib == -1) {
      return '';
    }
    const libNode = Libs.findOne({ libId: this.lib });
    return libNode.name;
  },
  showIfHasLib() {
    return this.lib != -1 ? '' : 'hidden';
  },
  libStateDescription() {
    const reported = Paths.findOne(Session.get('inspectedWarning')).reported;
    return reported ? 'going through' : 'ending because of';
  },
  showCode(nodeId) {
    return Nodes.findOne({ nodeId: nodeId })?.code;
  }
});

Template.intermediateNodes.events({
  'click .lib_impact'(event) {
    const libId = $(event.target).attr('data-libId');
    Session.set('inspectedLib', parseInt(libId));
  },
  'click .slide_clicker'(event) {
    var referenceId = $(event.target).attr('data-slide'); // Get the id to scroll to
    var elementToScrollTo = document.getElementById(referenceId);
    if (elementToScrollTo) {
      elementToScrollTo.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
});

Template.intermediateNodes.onRendered(function() {
  this.findAll('.middle').forEach(function(middle) {
    hljs.highlightBlock(middle, { language: 'java' });
  });
  this.findAll('.start,.end,.middle').forEach(function(start) {
    start.innerHTML = start.innerHTML.replace(/---focus---/g, '<strong class="focus" style="background-color: red;color: white!important;">').replace(/---\/focus---/g, '</strong>');
  });
});

Template.questionChoices.helpers({
  buttonText() {
    const currentWarning = Session.get('inspectedWarning');
    const currentWhyNodeModel = Session.get('whyNodeModel');
    return currentWhyNodeModel === currentWarning ? 'Hide path' : 'Show path';
  },
  isOrIsNot() {
    const reported = Paths.findOne(Session.get('inspectedWarning')).reported;
    return reported ? 'is' : 'is not';
  },
  start() {
    const path = Paths.findOne(Session.get('inspectedWarning')).left;
    return path ? path.description : '';
  },
  end() {
    const path = Paths.findOne(Session.get('inspectedWarning')).right;
    return path ? path.description : '';
  }
});

Template.questionChoices.events({
  'click .why_node_model'(event) {
    const currentWarning = Session.get('inspectedWarning');
    const currentWhyNodeModel = Session.get('whyNodeModel');

    console.log('currentWarning:', currentWarning);
    console.log('currentWhyNodeModel:', currentWhyNodeModel);

    if (currentWhyNodeModel === currentWarning) {
      // If already shown, hide it
      Session.set('whyNodeModel', '');
    } else {
      // If hidden, show it
      Session.set('whyNodeModel', currentWarning);
      Session.set('inspectedLib', '');
    }
  }
});

Template.questionChoices.onRendered(function() {
  this.autorun(() => {
    const currentWarning = Session.get('inspectedWarning');
    const currentWhyNodeModel = Session.get('whyNodeModel');
    const buttonText = currentWhyNodeModel === currentWarning ? 'Hide path' : 'Show path';
    document.getElementById('toggleButton').innerText = buttonText;
  });
});


Template.libraryImpact.helpers({
  displaySelectedLibNode() {
    const libNode = Libs.findOne({ libId: Session.get('inspectedLib') });
    return libNode ? libNode.name : '';
  },
  paths() {
    const libNode = Libs.findOne({ libId: Session.get('inspectedLib') });
    var results = [];
    // Enumerate over zip(libNode.sources and libNode.sinks)
    if (libNode) {
      for (var i = 0; i < libNode.sources.length; i++) {
        results.push({ warningNumber: libNode.warningNumbers[i], start: libNode.sources[i], end: libNode.sinks[i] });
      }
    }
    return results;
  },
  libStateDescription() {
    const reported = Paths.findOne(Session.get('inspectedWarning')).reported;
    return reported ? 'going through' : 'blocked because of';
  }
});

Template.sourceSinkPair.helpers({
  codeFromNode(nodeId) {
    return Nodes.findOne({ nodeId: nodeId }).code;
  },
  isReported() {
    return Paths.findOne(Session.get('inspectedWarning')).reported ? '' : '<em>Unreported</em>';
  }
});

Template.sourceSinkPair.onRendered(function() {
  // hljs on the left, right
  hljs.highlightBlock(this.find('.start'), { language: 'java' });
  this.findAll('.middle').forEach(function(middle) {
    hljs.highlightBlock(middle, { language: 'java' });
  });
  hljs.highlightBlock(this.find('.end'), { language: 'java' });
  // Replace <focus> in the content of the .start blocks with <strong>
  this.findAll('.start,.end,.middle').forEach(function(start) {
    start.innerHTML = start.innerHTML.replace(/---focus---/g, '<strong class="focus" style="background-color: red;color: white!important;">').replace(/---\/focus---/g, '</strong>');
  });
});
