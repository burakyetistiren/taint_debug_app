import { Meteor } from 'meteor/meteor';
import fs from 'fs';
import path from 'path';

export const Paths = new Mongo.Collection('paths');
export const Libs = new Mongo.Collection('libs');


PROJECT_PATH = process.env.PWD;

ANALYSIS_PATH =  path.join(PROJECT_PATH, '..', 'analysis_files') + "/";

Meteor.startup(() => {
  console.log('Server started');
  // console.log(PROJECT_PATH)
  analysisData = setupAndReadAnalysisData();
  // console.log(analysisData);

  Paths.insert(analysisData['codeSets']);
  Libs.insert(Array.from(analysisData.libSets.values()));
  // console.log('Inserted data into db', Paths.find().fetch(), Libs.find().fetch());

  
});


function readNodeMapping() {
  nodeMapping = {}
  const lines = fs.readFileSync(ANALYSIS_PATH + "souffle_files/nodes.debug", "utf-8").split("\n");
  lines.forEach(line => {
    if (line.trim()) {
      const [ nodeId, file, lineNum, column, endLineNum, endColNum ] = line.trim().split(",");
    
      console.log(nodeId, file, lineNum, column, endLineNum, endColNum);
      nodeMapping[nodeId] = {
        'file': file,
        'line': Number(lineNum),
        'column': Number(column),
        'end_line': Number(endLineNum),
        'end_column': Number(endColNum)
      }
    }
  });
  return nodeMapping;
}

function setupAndReadAnalysisData() {
    let pathsLibs = new Map();
    let codeSets = [];
    let libSets = new Map();

    const lines = fs.readFileSync(ANALYSIS_PATH + "warning_paths.csv", "utf-8").split("\n");
    lines.forEach(line => {
        if (line.trim()) {
            const [source, sink, node, step, libIndex] = line.trim().split("\t").map(Number);
            const key = `${source},${sink}`;
            if (!pathsLibs.has(key)) {
                pathsLibs.set(key, []);
            }
            pathsLibs.get(key).push({ nodeId: node, lib: libIndex });
        }
    });

    const nodeMapping = readNodeMapping();

    let paths = Array.from(pathsLibs, ([key, value]) => {
        const [source, sink] = key.split(",").map(Number);
        return { source, sink, nodeLibIndices: value };
    });

    paths.forEach(({ source, sink, nodeLibIndices }) => {
        codeSets.push({
            left: {
                code: codeSnippetOfNodeWithHighlight(source.toString(), nodeMapping),
                nodeId: source,
            },
            middle: nodeLibIndices.map(({ nodeId, lib }) => ({
                code: codeSnippetOfNodeWithHighlight(nodeId.toString(), nodeMapping),
                nodeId: nodeId,
                lib: lib,
            })),
            right: {
                code: codeSnippetOfNodeWithHighlight(sink.toString(), nodeMapping),
                nodeId: sink,
            }
        });
    });

    const modelDebugLines = fs.readFileSync(ANALYSIS_PATH + "souffle_files/model.debug", "utf-8").split("\n");
    modelDebugLines.forEach(line => {
        if (line.includes("model_node")) {
            const [name, lib] = line.split("model_node(")[1].slice(0, -1).split(",");
            libSets.set(parseInt(lib), { name: name });
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

        [left, right].forEach(side => {
            if (!('lib' in side) || !libSets.has(side.lib)) {
                side.importance = 0;
            } else {
                side.importance = Math.round(libSets.get(side.lib).importance);
                let libInfo = libSets.get(side.lib);
                if (!libInfo.sources) libInfo.sources = [];
                if (!libInfo.sinks) libInfo.sinks = [];
                if (side.nodeId && !libInfo.sources.includes(side.nodeId)) {
                    libInfo.sources.push(side.nodeId);
                }
                if (side.nodeId && !libInfo.sinks.includes(side.nodeId)) {
                    libInfo.sinks.push(side.nodeId);
                }
            }
        });

        codeSet.middle.forEach(middleCode => {
            let lib = middleCode.lib;
            if (!libSets.has(lib)) {
                middleCode.importance = 0;
            } else {
                let libInfo = libSets.get(lib);
                middleCode.importance = Math.round(libInfo.importance);
                if (!libInfo.sources) libInfo.sources = [];
                if (!libInfo.sinks) libInfo.sinks = [];
                if (!libInfo.sources.includes(codeSet.left.nodeId)) {
                    libInfo.sources.push(codeSet.left.nodeId);
                }
                if (!libInfo.sinks.includes(codeSet.right.nodeId)) {
                    libInfo.sinks.push(codeSet.right.nodeId);
                }
            }
        });
    });

    return { codeSets, libSets };
}

function codeSnippetOfNodeWithHighlight(nodeId, nodeMapping, style = "bold red bg:white") {
  const { file, line, colNum, endColNum } =  getFileLoc(nodeId, nodeMapping);

  console.log(file, line, colNum, endColNum);
  const surroundingBef =  readLinesFromFile(file, line - 3, line - 1);
  var targetLine =  readLineFromFile(file, line);
  const surroundingAft =  readLinesFromFile(file, line + 1, line + 3);

  const fileSuffix = file.split('/').pop();
  const metadataLines = `// File: ${fileSuffix}\n// Line: ${line}\n`;

  targetLine = targetLine.substring(0, colNum) + '<span class="highlight" style="' + style + '">' + targetLine.substring(colNum, endColNum) + '</span>' + targetLine.substring(endColNum);
  const modifiedCode = metadataLines + surroundingBef + targetLine + '\n' + surroundingAft;

  return modifiedCode;
}


function readLinesFromFile(file, startLine, endLine) {
  let lines = fs.readFileSync(file,
    { encoding: 'utf-8' }).split("\n");
  let result = "";
  for (let i = startLine; i <= endLine; i++) {
    if (i < 0 || i >= lines.length) {
      continue;
    }
    result += lines[i] + "\n";
  }
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
    // var file = fs.readFileSync(filePath, 'utf8');
    // return file;
  }
});