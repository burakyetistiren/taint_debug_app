import { Meteor } from 'meteor/meteor';
import fs from 'fs';
import path from 'path';

export const Paths = new Mongo.Collection('paths');
export const Libs = new Mongo.Collection('libs');
export const Nodes = new Mongo.Collection('nodes');


PROJECT_PATH = process.env.PWD;

ANALYSIS_PATH =  path.join(PROJECT_PATH, '..', 'analysis_files') + "/";

Meteor.startup(() => {
  console.log('Server started');

  // clear 
  Paths.remove({});
  Libs.remove({});
  Nodes.remove({});

  // console.log(PROJECT_PATH)
  analysisData = setupAndReadAnalysisData();
  // console.log(analysisData);

  // fetch nodes from analysisData
  // insert into Nodes collection


  analysisData['codeSets'].forEach(codeSet => {
    Paths.insert(codeSet);
  });
  analysisData['libSets'].forEach(libSet => {
    Libs.insert(libSet);
  });
  // Libs.insert(Array.from(analysisData['libSets'].values()));
  // console.log('Inserted data into db', Paths.find().fetch(), Libs.find().fetch());

  
});


function readNodeMapping() {
  nodeMapping = {}
  const lines = fs.readFileSync(ANALYSIS_PATH + "souffle_files/nodes.debug", "utf-8").split("\n");
  lines.forEach(line => {
    if (line.trim()) {
      const [ nodeId, file, lineNum, column, endLineNum, endColNum, description ] = line.trim().split(",");
    
      nodeMapping[Number(nodeId)] = {
        'nodeId': Number(nodeId),
        'file': file,
        'line': Number(lineNum),
        'column': Number(column),
        'end_line': Number(endLineNum),
        'end_column': Number(endColNum),
        'description': description
      };

    }
  });
  return nodeMapping;
}

function setupAndReadAnalysisData() {
    let pathsLibs = new Map();
    let codeSets = [];
    let libSets = new Map();
    let warningToReported = new Map();
    let nodePairToEdgeId = new Map();

    const lines = fs.readFileSync(ANALYSIS_PATH + "warning_paths.csv", "utf-8").split("\n");
    lines.forEach(line => {
        if (line.trim()) {
            const [source, sink, node, step, edge, libIndex] = line.trim().split("\t").map(Number);



            const key = `${source},${sink}`;
            if (!pathsLibs.has(key)) {
                pathsLibs.set(key, []);
            }
            pathsLibs.get(key).push({ nodeId: node, lib: libIndex, edgeId: edge});
            warningToReported.set(key, true);   

            nodePairToEdgeId.set(key, edge);

        }
    });

    
    plausible_lines = fs.readFileSync(ANALYSIS_PATH + "plausible_warning_paths.csv", "utf-8").split("\n");
    plausible_lines.forEach(line => {
      if (line.trim()) {
        const [source, sink, node, step, edge, libIndex] = line.trim().split("\t").map(Number);


        const key = `${source},${sink}`;
        if (!pathsLibs.has(key)) {
            pathsLibs.set(key, []);
        }
        pathsLibs.get(key).push({ nodeId: node, lib: libIndex, edgeId: edge});
        warningToReported.set(key, false);

        nodePairToEdgeId.set(key, edge);        
      }
    });

    const nodeMapping = readNodeMapping();
    
    Object.keys(nodeMapping).forEach(nodeId => {
        const code = codeSnippetOfNodeWithHighlight(nodeId, nodeMapping);
        var node = nodeMapping[nodeId];
        node.code = code;

        Nodes.insert(node);
    });

    let paths = Array.from(pathsLibs, ([key, value]) => {
        const [source, sink] = key.split(",").map(Number);
        return { source, sink, nodeLibIndicesAndEdgeId: value, reported : warningToReported.get(key)};
    });


    paths.forEach(({ source, sink, nodeLibIndicesAndEdgeId, reported}) => {
        let warningNumber = codeSets.length;

        codeSets.push({
            warningNumber: warningNumber,
            reported: reported,
            left: {
                code: codeSnippetOfNodeWithHighlight(source, nodeMapping),
                nodeId: source,
                description: nodeMapping[source].description,
            },
            middle: nodeLibIndicesAndEdgeId.map(({ nodeId, lib, edgeId }) => ({
                code: codeSnippetOfNodeWithHighlight(nodeId, nodeMapping),
                nodeId: nodeId,
                lib: lib,
                edgeId: edgeId,
                description: nodeMapping[nodeId].description,
            })),
            right: {
                code: codeSnippetOfNodeWithHighlight(sink, nodeMapping),
                nodeId: sink,
                description: nodeMapping[sink].description,
            }
        });
    });


    const modelDebugLines = fs.readFileSync(ANALYSIS_PATH + "souffle_files/model.debug", "utf-8").split("\n");
    modelDebugLines.forEach(line => {
        if (line.includes("model_node")) {
            const [name, lib] = line.split("model_node(")[1].slice(0, -1).split(",");
            libSets.set(parseInt(lib), { name: name, libId: parseInt(lib)});
        }
    });

    const centralityLines = fs.readFileSync(ANALYSIS_PATH + "souffle_files/lib_centrality.facts", "utf-8").split("\n");
    centralityLines.forEach(line => {
        if (line.trim()) {
            const [lib, centrality, scaledCentrality] = line.split("\t");
            if (libSets.has(parseInt(lib))) {
                libSets.get(parseInt(lib)).importance = parseFloat(scaledCentrality);
            }
        }
    });

    codeSets.forEach(codeSet => {

        codeSet.middle.forEach(middleCode => {
            let lib = middleCode.lib;
            if (!libSets.has(lib)) {
                middleCode.importance = 0;
            } else {
                let libInfo = libSets.get(lib);
                middleCode.importance = Math.round(libInfo.importance);
                if (!libInfo.sources) libInfo.sources = [];
                if (!libInfo.sinks) libInfo.sinks = [];

                libInfo.sources.push(codeSet.left.nodeId);
                
                libInfo.sinks.push(codeSet.right.nodeId);
                
                if (!libInfo.warningNumbers) libInfo.warningNumbers = [];
                libInfo.warningNumbers.push(codeSet.warningNumber);
            }
        });
    });

    return { codeSets, libSets };
}

function codeSnippetOfNodeWithHighlight(nodeId, nodeMapping) {
  const { file, line, colNum, endColNum } =  getFileLoc(nodeId, nodeMapping);

  const surroundingBef =  readLinesFromFile(file, line - 3, line - 1);
  var targetLine =  readLineFromFile(file, line);
  const surroundingAft =  readLinesFromFile(file, line + 1, line + 3);

  const fileSuffix = file.split('/').pop();
  const metadataLines = `// File: ${fileSuffix}\n// Line: ${line}\n`;

  
  targetLine = targetLine.substring(0, colNum) + '---focus---' + targetLine.substring(colNum, endColNum) + '---/focus---' + targetLine.substring(endColNum);
  const modifiedCode = metadataLines + surroundingBef + '\n' + targetLine + '\n' + surroundingAft;

  return modifiedCode;
}


function readLinesFromFile(file, startLine, endLine) {
  let lines = fs.readFileSync(file,
    { encoding: 'utf-8' }).split("\n");
  
  result = lines.slice(startLine - 1, endLine).join("\n");
  return result;
}

function readLineFromFile(file, line) {
  let lines = fs.readFileSync(file,
    { encoding: 'utf-8' }).split("\n");
  return lines[line - 1];
}

function getFileLoc(nodeId, nodeMapping) {

    return { file: nodeMapping[nodeId]['file'] , line: parseInt(nodeMapping[nodeId]['line']), colNum: parseInt(nodeMapping[nodeId]['column']) - 1, endColNum: parseInt(nodeMapping[nodeId]['end_column']) };
}


Meteor.methods({
  readFileContents(filePath) {
    var file = fs.readFileSync(path.join(PROJECT_PATH, filePath), 'utf8');
    return file;
  },
  readGraphData() {
    const edges = [];
    const nodes = [];
    const nodesSet = new Set();
    const nodeMapping = readNodeMapping();

    // read library_nodes
    let libNodesLines = fs.readFileSync(ANALYSIS_PATH + "souffle_files/library_node.facts", "utf-8").split("\n");
    let libNodes = new Map();

    libNodesLines.forEach(line => {
      if (line.trim()) {
        const [libId, nodeId] = line.trim().split("\t").map(Number);
        libNodes.set(nodeId, libId);
      }
    });

    let edgeToWarningNumber = new Map();
    Paths.find().fetch().forEach(path => {
      path.middle.forEach(middle => {
        edgeToWarningNumber.set(middle.edgeId, path.warningNumber);
      });
    });
    
    const lines = fs.readFileSync(ANALYSIS_PATH + "souffle_files/edge.facts", "utf-8").split("\n");
    lines.forEach(line => {
      if (!line.trim()) return;
      const [edgeId, sourceId, targetId] = line.split("\t");
      
      let sourceName = nodeMapping[parseInt(sourceId)].description;
      let targetName = nodeMapping[parseInt(targetId)].description;
      let isSourceLibNode = libNodes.has(parseInt(sourceId));
      let isTargetLibNode = libNodes.has(parseInt(targetId));
      let warningNumber = edgeToWarningNumber.get(parseInt(edgeId));
      
      edges.push({ edgeId, sourceId, targetId, sourceName, targetName, isSourceLibNode, isTargetLibNode, warningNumber});
      nodesSet.add(sourceId);
      nodesSet.add(targetId);
    });
    nodesSet.forEach(node => {
      nodes.push({ nodeId: node, description: nodeMapping[node].description });
    });
    return { nodes, edges };

  }
});