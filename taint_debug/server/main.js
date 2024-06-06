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
  console.log(analysisData);

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
    
      // console.log(nodeId, file, lineNum, column, endLineNum, endColNum, description);
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

    const lines = fs.readFileSync(ANALYSIS_PATH + "warning_paths.csv", "utf-8").split("\n");
    lines.forEach(line => {
        if (line.trim()) {
            const [source, sink, node, step, libIndex] = line.trim().split("\t").map(Number);
            // ignore first and last step (corresponding to the source and sinks)
            if (step == 0 || node == sink) return;

            const key = `${source},${sink}`;
            if (!pathsLibs.has(key)) {
                pathsLibs.set(key, []);
            }
            pathsLibs.get(key).push({ nodeId: node, lib: libIndex});
            warningToReported.set(key, true);
        }
    });
    plausible_lines = fs.readFileSync(ANALYSIS_PATH + "plausible_warning_paths.csv", "utf-8").split("\n");
    plausible_lines.forEach(line => {
      if (line.trim()) {
        const [source, sink, node, step, libIndex] = line.trim().split("\t").map(Number);
        // ignore first and last step (corresponding to the source and sinks)
        if (step == 0 || node == sink) return;

        const key = `${source},${sink}`;
        if (!pathsLibs.has(key)) {
            pathsLibs.set(key, []);
        }
        pathsLibs.get(key).push({ nodeId: node, lib: libIndex });
        warningToReported.set(key, false);
      }
    });

    const nodeMapping = readNodeMapping();
    // enumerate over nodeMapping
    Object.keys(nodeMapping).forEach(nodeId => {
        const code = codeSnippetOfNodeWithHighlight(nodeId, nodeMapping);
        var node = nodeMapping[nodeId];
        node.code = code;
        // console.log(node);

        Nodes.insert(node);
    });

    let paths = Array.from(pathsLibs, ([key, value]) => {
        const [source, sink] = key.split(",").map(Number);
        return { source, sink, nodeLibIndices: value, reported : warningToReported.get(key)};
    });

    paths.forEach(({ source, sink, nodeLibIndices, reported }) => {
        codeSets.push({
            warningNumber: codeSets.length,
            reported: reported,
            left: {
                code: codeSnippetOfNodeWithHighlight(source, nodeMapping),
                nodeId: source,
                description: nodeMapping[source].description,
            },
            middle: nodeLibIndices.map(({ nodeId, lib }) => ({
                code: codeSnippetOfNodeWithHighlight(nodeId, nodeMapping),
                nodeId: nodeId,
                lib: lib,
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
        let left = codeSet.left;
        let right = codeSet.right;

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

  // console.log(file, line, colNum, endColNum);
  const surroundingBef =  readLinesFromFile(file, line - 3, line - 1);
  var targetLine =  readLineFromFile(file, line);
  const surroundingAft =  readLinesFromFile(file, line + 1, line + 3);

  const fileSuffix = file.split('/').pop();
  const metadataLines = `// File: ${fileSuffix}\n// Line: ${line}\n`;

  
  targetLine = targetLine.substring(0, colNum) + '---focus---' + targetLine.substring(colNum, endColNum) + '---/focus---' + targetLine.substring(endColNum);
  const modifiedCode = metadataLines + surroundingBef + '\n' + targetLine + '\n' + surroundingAft;

    // console.log(modifiedCode)
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
  }
});