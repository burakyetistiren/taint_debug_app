import { Meteor } from 'meteor/meteor';
import fs from 'fs';
import path from 'path';

export const Paths = new Mongo.Collection('paths');
export const Libs = new Mongo.Collection('libs');
export const Nodes = new Mongo.Collection('nodes');

const PROJECT_PATH = process.env.PWD;
const ANALYSIS_PATH = path.join(PROJECT_PATH, '..', 'analysis_files') + "/";

Meteor.startup(() => {
  console.log('Server started');

  // Clear existing data
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

  // Read additional facts files
  const sinks = readFactFile('sink.facts');
  const sources = readFactFile('source.facts');
  const sanitizers = readFactFile('sanitizer.facts');
  const apis = readFactFile('api.facts');

  // Save facts data to Meteor
  Meteor.methods({
    getFactNodes() {
      return {
        sinks,
        sources,
        sanitizers,
        apis,
      };
    },
  });
});

function readFactFile(filename) {
  const filepath = path.join(ANALYSIS_PATH, 'souffle_files/', filename);
  console.log('Reading file:', filepath);
  if (!fs.existsSync(filepath)) return [];
  const data = fs.readFileSync(filepath, 'utf8');
  return data.split('\n').filter(Boolean).map(Number);
}

function readNodeMapping() {
  const nodeMapping = {};
  const lines = fs.readFileSync(path.join(ANALYSIS_PATH, 'souffle_files/nodes.debug'), 'utf8').split('\n');
  lines.forEach(line => {
    if (line.trim()) {
      const [nodeId, file, lineNum, column, endLineNum, endColNum, description] = line.trim().split(',');
      nodeMapping[Number(nodeId)] = {
        nodeId: Number(nodeId),
        file,
        line: Number(lineNum),
        column: Number(column),
        end_line: Number(endLineNum),
        end_column: Number(endColNum),
        description,
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

  const lines = fs.readFileSync(path.join(ANALYSIS_PATH, 'warning_paths.csv'), 'utf8').split('\n');
  lines.forEach(line => {
    if (line.trim()) {
      const [source, sink, node, step, edge, libIndex] = line.trim().split('\t').map(Number);

      const key = `${source},${sink}`;
      if (!pathsLibs.has(key)) {
        pathsLibs.set(key, []);
      }
      pathsLibs.get(key).push({ nodeId: node, lib: libIndex, edgeId: edge });
      warningToReported.set(key, true);

      nodePairToEdgeId.set(key, edge);
    }
  });

  const plausibleLines = fs.readFileSync(path.join(ANALYSIS_PATH, 'plausible_warning_paths.csv'), 'utf8').split('\n');
  plausibleLines.forEach(line => {
    if (line.trim()) {
      const [source, sink, node, step, edge, libIndex] = line.trim().split('\t').map(Number);

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
    var node = nodeMapping[nodeId];
    node.code = code;

    Nodes.insert(node);
  });

  let paths = Array.from(pathsLibs, ([key, value]) => {
    const [source, sink] = key.split(',').map(Number);
    return { source, sink, nodeLibIndicesAndEdgeId: value, reported: warningToReported.get(key) };
  });

  paths.forEach(({ source, sink, nodeLibIndicesAndEdgeId, reported }) => {
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
      },
    });
  });

  const modelDebugLines = fs.readFileSync(path.join(ANALYSIS_PATH, 'souffle_files/model.debug'), 'utf8').split('\n');
  modelDebugLines.forEach(line => {
    if (line.includes('model_node')) {
      const [name, lib] = line.split('model_node(')[1].slice(0, -1).split(',');
      libSets.set(parseInt(lib), { name: name, libId: parseInt(lib) });
    }
  });

  const centralityLines = fs.readFileSync(path.join(ANALYSIS_PATH, 'souffle_files/lib_centrality.facts'), 'utf8').split('\n');
  centralityLines.forEach(line => {
    if (line.trim()) {
      const [lib, centrality, scaledCentrality] = line.split('\t');
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
  const { file, line, colNum, endColNum } = getFileLoc(nodeId, nodeMapping);

  const surroundingBef = readLinesFromFile(file, line - 3, line - 1);
  var targetLine = readLineFromFile(file, line);
  const surroundingAft = readLinesFromFile(file, line + 1, line + 3);

  const fileSuffix = file.split('/').pop();
  const metadataLines = `// File: ${fileSuffix}\n// Line: ${line}\n`;

  targetLine = targetLine.substring(0, colNum) + '---focus---' + targetLine.substring(colNum, endColNum) + '---/focus---' + targetLine.substring(endColNum);
  const modifiedCode = metadataLines + surroundingBef + '\n' + targetLine + '\n' + surroundingAft;

  return modifiedCode;
}

function readLinesFromFile(file, startLine, endLine) {
  let lines = fs.readFileSync(file, { encoding: 'utf-8' }).split('\n');
  const result = lines.slice(startLine - 1, endLine).join('\n');
  return result;
}

function readLineFromFile(file, line) {
  let lines = fs.readFileSync(file, { encoding: 'utf-8' }).split('\n');
  return lines[line - 1];
}

function getFileLoc(nodeId, nodeMapping) {
  return { file: nodeMapping[nodeId]['file'], line: parseInt(nodeMapping[nodeId]['line']), colNum: parseInt(nodeMapping[nodeId]['column']) - 1, endColNum: parseInt(nodeMapping[nodeId]['end_column']) };
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
    let libNodesLines = fs.readFileSync(path.join(ANALYSIS_PATH, 'souffle_files/library_node.facts'), 'utf8').split('\n');
    let libNodes = new Map();

    libNodesLines.forEach(line => {
      if (line.trim()) {
        const [nodeId, libId] = line.trim().split('\t').map(Number);
        libNodes.set(nodeId, libId);
      }
    });

    let edgeToWarningNumber = new Map();
    Paths.find().fetch().forEach(path => {
      path.middle.forEach(middle => {
        edgeToWarningNumber.set(middle.edgeId, path.warningNumber);
      });
    });

    const lines = fs.readFileSync(path.join(ANALYSIS_PATH, 'souffle_files/edge.facts'), 'utf8').split('\n');
    const analysisEdges = new Set();
    lines.forEach(line => {
      if (line.trim()) {
        const [edgeId, sourceId, targetId] = line.trim().split('\t');
        analysisEdges.add(edgeId);
      }
    });

    const allEdgesLines = fs.readFileSync(path.join(ANALYSIS_PATH, 'souffle_files/plausible_edge.facts'), 'utf8').split('\n');
    allEdgesLines.forEach(line => {
      if (!line.trim()) return;
      let [edgeId, sourceId, targetId] = line.split('\t');

      let sourceName = nodeMapping[parseInt(sourceId)].description;
      let targetName = nodeMapping[parseInt(targetId)].description;
      let sourceLibNode = libNodes.get(parseInt(sourceId));
      let targetLibNode = libNodes.get(parseInt(targetId));
      let warningNumber = edgeToWarningNumber.get(parseInt(edgeId));

      // map the nodes of the same lib nodes to same nodes
      if (sourceLibNode) {
        console.log('mapping source', sourceId, ' to ', sourceLibNode);
        // copy entry over in nodeMapping
        nodeMapping[sourceLibNode] = nodeMapping[sourceId];
        sourceId = sourceLibNode;
      }
      if (targetLibNode) {
        console.log('mapping target', targetId, ' to ', targetLibNode);
        // copy entry over in nodeMapping
        nodeMapping[targetLibNode] = nodeMapping[targetId];
        targetId = targetLibNode;
      }
      let isAnalysisEdge = analysisEdges.has(edgeId);
      edges.push({ edgeId, sourceId, targetId, sourceName, targetName, sourceLibNode, targetLibNode, warningNumber, isAnalysisEdge });
      nodesSet.add(sourceId);
      nodesSet.add(targetId);
    });
    nodesSet.forEach(node => {
      nodes.push({ nodeId: node, description: nodeMapping[node] ? nodeMapping[node].description : node });
    });
    console.log(edges);
    return { nodes, edges };
  }
});
