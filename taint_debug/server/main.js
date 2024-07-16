import { Meteor } from 'meteor/meteor';
import fs from 'fs';
import path from 'path';

export const Paths = new Mongo.Collection('paths');
export const Libs = new Mongo.Collection('libs');
export const Nodes = new Mongo.Collection('nodes');

PROJECT_PATH = process.env.PWD;
ANALYSIS_PATH = path.join(PROJECT_PATH, '..', 'analysis_files') + "/";

Meteor.startup(() => {
  console.log('Server started');

  // Clear collections
  Paths.remove({});
  Libs.remove({});
  Nodes.remove({});

  const analysisData = setupAndReadAnalysisData();

  analysisData['codeSets'].forEach(codeSet => {
    Paths.insert(codeSet);
  });
  analysisData['libSets'].forEach(libSet => {
    Libs.insert(libSet);
  });
});

function readNodeMapping() {
  const nodeMapping = {};
  const lines = fs.readFileSync(ANALYSIS_PATH + "souffle_files/nodes.debug", "utf-8").split("\n");
  lines.forEach(line => {
    if (line.trim()) {
      const [nodeId, file, lineNum, column, endLineNum, endColNum, description] = line.trim().split(",");
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
  const pathsLibs = new Map();
  const codeSets = [];
  const libSets = new Map();
  const warningToReported = new Map();
  const nodePairToEdgeId = new Map();

  const lines = fs.readFileSync(ANALYSIS_PATH + "warning_paths.csv", "utf-8").split("\n");
  lines.forEach(line => {
    if (line.trim()) {
      const [source, sink, node, step, edge, libIndex] = line.trim().split("\t").map(Number);
      const key = `${source},${sink}`;
      if (!pathsLibs.has(key)) {
        pathsLibs.set(key, []);
      }
      pathsLibs.get(key).push({ nodeId: node, lib: libIndex, edgeId: edge });
      warningToReported.set(key, true);
      nodePairToEdgeId.set(key, edge);
    }
  });

  const plausible_lines = fs.readFileSync(ANALYSIS_PATH + "plausible_warning_paths.csv", "utf-8").split("\n");
  plausible_lines.forEach(line => {
    if (line.trim()) {
      const [source, sink, node, step, edge, libIndex] = line.trim().split("\t").map(Number);
      const key = `${source},${sink}`;
      if (!pathsLibs.has(key)) {
        pathsLibs.set(key, []);
      }
      pathsLibs.get(key).push({ nodeId: node, lib: libIndex, edgeId: edge });
      warningToReported.set(key, false);
      nodePairToEdgeId.set(key, edge);
    }
  });

  const nodeMapping = readNodeMapping();
  Object.keys(nodeMapping).forEach(nodeId => {
    const code = codeSnippetOfNodeWithHighlight(nodeId, nodeMapping);
    const node = nodeMapping[nodeId];
    node.code = code;
    Nodes.insert(node);
  });

  const paths = Array.from(pathsLibs, ([key, value]) => {
    const [source, sink] = key.split(",").map(Number);
    return { source, sink, nodeLibIndicesAndEdgeId: value, reported: warningToReported.get(key) };
  });

  paths.forEach(({ source, sink, nodeLibIndicesAndEdgeId, reported }) => {
    const warningNumber = codeSets.length;
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
      libSets.set(parseInt(lib), { name: name, libId: parseInt(lib) });
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
      const lib = middleCode.lib;
      if (!libSets.has(lib)) {
        middleCode.importance = 0;
      } else {
        const libInfo = libSets.get(lib);
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
  const { file, line, colNum, endColNum } = getFileLoc(nodeId, nodeMapping);
  const surroundingBef = readLinesFromFile(file, line - 3, line - 1);
  let targetLine = readLineFromFile(file, line);
  const surroundingAft = readLinesFromFile(file, line + 1, line + 3);
  const fileSuffix = file.split('/').pop();
  const metadataLines = `// File: ${fileSuffix}\n// Line: ${line}\n`;
  targetLine = targetLine.substring(0, colNum) + '---focus---' + targetLine.substring(colNum, endColNum) + '---/focus---' + targetLine.substring(endColNum);
  const modifiedCode = metadataLines + surroundingBef + '\n' + targetLine + '\n' + surroundingAft;
  return modifiedCode;
}

function readLinesFromFile(file, startLine, endLine) {
  const lines = fs.readFileSync(file, { encoding: 'utf-8' }).split("\n");
  return lines.slice(startLine - 1, endLine).join("\n");
}

function readLineFromFile(file, line) {
  const lines = fs.readFileSync(file, { encoding: 'utf-8' }).split("\n");
  return lines[line - 1];
}

function getFileLoc(nodeId, nodeMapping) {
  return { file: nodeMapping[nodeId].file, line: parseInt(nodeMapping[nodeId].line), colNum: parseInt(nodeMapping[nodeId].column) - 1, endColNum: parseInt(nodeMapping[nodeId].end_column) };
}

Meteor.methods({
  readFileContents(filePath) {
    return fs.readFileSync(path.join(PROJECT_PATH, filePath), 'utf8');
  },
  readGraphData() {
    const edges = [];
    const nodes = [];
    const nodesSet = new Set();
    const nodeMapping = readNodeMapping();

    const libNodesLines = fs.readFileSync(ANALYSIS_PATH + "souffle_files/library_node.facts", "utf-8").split("\n");
    const libNodes = new Map();
    libNodesLines.forEach(line => {
      if (line.trim()) {
        const [nodeId, libId] = line.trim().split("\t").map(Number);
        libNodes.set(nodeId, libId);
      }
    });

    const edgeToWarningNumber = new Map();
    Paths.find().fetch().forEach(path => {
      path.middle.forEach(middle => {
        edgeToWarningNumber.set(middle.edgeId, path.warningNumber);
      });
    });

    const lines = fs.readFileSync(ANALYSIS_PATH + "souffle_files/edge.facts", "utf-8").split("\n");
    const analysisEdges = new Set();
    lines.forEach(line => {
      if (line.trim()) {
        const [edgeId, sourceId, targetId] = line.trim().split("\t");
        analysisEdges.add(edgeId);
      }
    });

    const allEdgesLines = fs.readFileSync(ANALYSIS_PATH + "souffle_files/plausible_edge.facts", "utf-8").split("\n");
    allEdgesLines.forEach(line => {
      if (line.trim()) {
        let [edgeId, sourceId, targetId] = line.split("\t");
        const sourceName = nodeMapping[parseInt(sourceId)].description;
        const targetName = nodeMapping[parseInt(targetId)].description;
        const sourceLibNode = libNodes.get(parseInt(sourceId));
        const targetLibNode = libNodes.get(parseInt(targetId));
        const warningNumber = edgeToWarningNumber.get(parseInt(edgeId));

        if (sourceLibNode) {
          console.log('mapping source', sourceId, ' to ', sourceLibNode);
          nodeMapping[sourceLibNode] = nodeMapping[sourceId];
          sourceId = sourceLibNode;
        }
        if (targetLibNode) {
          console.log('mapping target', targetId, ' to ', targetLibNode);
          nodeMapping[targetLibNode] = nodeMapping[targetId];
          targetId = targetLibNode;
        }

        const isAnalysisEdge = analysisEdges.has(edgeId);
        edges.push({
          edgeId,
          sourceId,
          targetId,
          sourceName,
          targetName,
          sourceLibNode,
          targetLibNode,
          warningNumber,
          isAnalysisEdge
        });
        nodesSet.add(sourceId);
        nodesSet.add(targetId);
      }
    });

    nodesSet.forEach(node => {
      let importance = libCentrality.get(node);

      nodes.push({ 
        nodeId: node, 
        description: nodeMapping[node] ? nodeMapping[node].description : node, 
        importance: importance,
        isSource: sources.has(node),
        isSink: sinks.has(node),
      });
    });

    console.log(edges);
    return { nodes, edges };
  }
});
