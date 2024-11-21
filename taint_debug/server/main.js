import { Meteor } from 'meteor/meteor';
import fs from 'fs';
import fsPromise from 'fs/promises';
import readline from 'readline';
import path from 'path';

export const Paths = new Mongo.Collection('paths');
export const Libs = new Mongo.Collection('libs');
export const Nodes = new Mongo.Collection('nodes');
export const Edges = new Mongo.Collection('edges');
export const Sources = new Mongo.Collection('sources');
export const Sinks = new Mongo.Collection('sinks');
export const QueryResults = new Mongo.Collection('queryResults');

const PROJECT_PATH = process.env.PWD;
const ANALYSIS_PATH = path.join(PROJECT_PATH, '..', 'analysis_files') + "/";
const QUERY_PATH = path.join(PROJECT_PATH, '..', 'app_souffle_queries') + "/";
const QUERY_RESULT_PATH = path.join(PROJECT_PATH, '..', 'souffle_output') + "/";

const SOURCE_CODE_ROOT_DIR = process.env.SOURCE_CODE_ROOT_DIR;

async function readLargeFile(filePath, processLine) {
  const fileStream = fs.createReadStream(filePath, 'utf8');
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  // Process each line.
  rl.on('line', (line) => {
    if (line.trim()) {
      processLine(line);
    }
  });

  return new Promise((resolve, reject) => {
    rl.on('close', () => {
      resolve();
    });

    rl.on('error', (error) => {
      reject(error);
    });
  });
}

Meteor.startup(() => {
  console.log('Server started');

  // Clear existing data
  Paths.remove({});
  Libs.remove({});
  Nodes.remove({});
  Edges.remove({});
  Sources.remove({});
  Sinks.remove({});
  QueryResults.remove({});

  console.log('clear data');

  setupAndReadAnalysisData().then(analysisData => {
    console.log('Finished reading analysis data');

    console.log(analysisData['codeSets'].length);
    console.log(analysisData['libSets'].size);

    var pathsToInsert = analysisData['codeSets'];
    Paths.batchInsert(pathsToInsert);
    // Paths.rawCollection().insertMany(pathsToInsert);
    // analysisData['codeSets'].forEach(codeSet => {
    //   Paths.insert(codeSet);
    // });
    // analysisData['libSets'].forEach(libSet => {
    //   Libs.insert(libSet);
    // });
    Libs.batchInsert(Array.from(analysisData['libSets'].values()));
    // Libs.rawCollection().insertMany(Array.from(analysisData['libSets'].values()));

    console.log('Finished inserting data');
    console.log('paths count')
    console.log(Paths.find().count());
    console.log('nodes count')
    console.log(Nodes.find().count());
  });


  // Read additional facts files
  const sinks = getSinksFromPlausibleWarningPaths()
  const sources = getSourcesFromPlausibleWarningPaths();
  const sanitizers = readCurrentSanitizers();
  const apiNodes = readLibraryNodes();
  const apiMapping = readLibMapping();
  const apiLibs =  Array.from(new Set(Object.values(apiMapping)));

  // Save facts data to Meteor
  Meteor.methods({
    getFactNodes() {
      return {
        
        nodes: [],
        // Nodes.find({}).fetch(), // this isn't used?
        edges: [],

        sinks,
        sources,
        sanitizers,
        apiNodes,
        apiMapping
      };
    },
    readDataflowJson() {
      return readDataflowJson();
    }
  });
});

function readFactFile(filename) {
  const filepath = path.join(ANALYSIS_PATH, 'souffle_files/', filename);
  console.log('Reading file:', filepath);
  if (!fs.existsSync(filepath)) return [];
  const data = fs.readFileSync(filepath, 'utf8');
  return data.split('\n').filter(Boolean).map(Number);
}

function getSinksFromPlausibleWarningPaths() {
  // just read from the database
  let sinks = Sinks.find().fetch();

  // return nodeId
  return sinks.map(sink => sink.nodeId);
}

function getSourcesFromPlausibleWarningPaths() {
  // just read from the database
  let sources = Sources.find().fetch();

  // return nodeId
  return sources.map(source => source.nodeId);
}

function readCurrentSanitizers() {
  const filepath = path.join(ANALYSIS_PATH, 'souffle_files/', 'sanitizer.facts');
  console.log('Reading file:', filepath);
  if (!fs.existsSync(filepath)) return [];
  const data = fs.readFileSync(filepath, 'utf8');
  return data.split('\n')
           .filter(Boolean)
           .map(line => {
               const [firstValue] = line.split('\t');
               return Number(firstValue);
           });
}

function readLibraryNodes() {
  const filepath = path.join(ANALYSIS_PATH, 'souffle_files/', 'library_node.facts');
  console.log('Reading file:', filepath);
  if (!fs.existsSync(filepath)) return [];
  const data = fs.readFileSync(filepath, 'utf8');
  return data.split('\n')
           .filter(Boolean)
           .map(line => {
               const [firstValue, secondValue] = line.split('\t');
               return Number(firstValue);
           });
}

function readLibMapping() {
  const filepath = path.join(ANALYSIS_PATH, 'souffle_files/', 'library_node.facts');
  console.log('Reading file:', filepath);
  if (!fs.existsSync(filepath)) return [];
  const data = fs.readFileSync(filepath, 'utf8');
  // return map of nodeId to libId
  return data.split('\n')
           .filter(Boolean)
           .reduce((map, line) => {
              const [nodeId, libId] = line.split('\t');
              map[nodeId.trim()] = libId.trim();
              return map;
            }, {});
}

function readNodeMapping() {
  const nodeMapping = {};
  const lines = fs.readFileSync(path.join(ANALYSIS_PATH, 'souffle_files/nodes.debug'), 'utf8').split('\n');
  lines.forEach(line => {
    if (line.trim()) {


      const [nodeId, file, lineNum, column, endLineNum, endColNum, description] = line.trim().split(',');

      nodeMapping[Number(nodeId)] = {
        nodeId: Number(nodeId),
        file: SOURCE_CODE_ROOT_DIR + file,
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


function separatePaths(pathsData, isReported) {
  const result = new Map();
  
  for (const [key, nodes] of pathsData) {
      const nodeMap = new Map(nodes.map(node => [(node.nodeId, node.step), node]));
      const sink = parseInt(key.split(',')[1]);
      const source = parseInt(key.split(',')[0]);
      
      result.set(key, []);
      
      const sinkNodes = nodes.filter(node => node.nodeId === sink);
      // console.log(sinkNodes)


      sinkNodes.forEach(sinkNode => {
          const path = [];
          let currentNode = sinkNode;
          // const visited = new Set();
          
          while (currentNode) {
            // && !visited.has(currentNode.nodeId)) {

              path.unshift(currentNode); 
              // visited.add(currentNode.nodeId);
              
              currentNode = currentNode.prevNode !== -1 ? nodeMap.get((currentNode.prevNode, currentNode.step - 1)) : null;
              
              if (currentNode && currentNode.step >= path[0].step) {
                  break;
              }
          }
          
          if (path.length > 0) {
            
              result.get(key).push({
                  isReported,
                  path
              });
          }
      });
  }
  
  return result;
}

function setupAndReadAnalysisData() {
  let pathsLibs = new Map();
  let plausiblePathLibs = new Map();
  let codeSets = [];
  let libSets = new Map();
  let warningToReported = new Map();
  let nodePairToEdgeId = new Map();

  let plausibleSources = new Set();
  let plausibleSinks = new Set();
  
  // TODO: quick hack
  let reportedPaths = new Set();


  const nodeMapping = readNodeMapping();
  const apiMapping = readLibMapping();
  
  var nodesToInsert = [];
  Object.keys(nodeMapping).forEach(nodeId => {
    const code = codeSnippetOfNodeWithHighlight(nodeId, nodeMapping);
    var node = nodeMapping[nodeId];
    node.code =  code //''; // to be filled afterwards
    node.file = nodeMapping[nodeId]['file'];
    node.line = parseInt(nodeMapping[nodeId]['line']);
    node.colNum = parseInt(nodeMapping[nodeId]['column']) - 1;
    node.endColNum =  parseInt(nodeMapping[nodeId]['end_column']);
    node.nodeId = parseInt(nodeId);
    node.description = nodeMapping[nodeId].description + (apiMapping[nodeId] ? " (library " + apiMapping[nodeId] + ")" : "");

    nodesToInsert.push(node);
    // console.log('inserted node');
  });
  Nodes.batchInsert(nodesToInsert);

  // trim nodesToInsert to 10
  // nodesToInsert = nodesToInsert.slice(0, 10);
  // Nodes.rawCollection().insertMany(nodesToInsert);

  // const lines = fs.readFileSync(path.join(ANALYSIS_PATH, 'warning_paths.csv'), 'utf8').split('\n');
  // lines.forEach(line => {
    
  // });
  return readLargeFile(path.join(ANALYSIS_PATH, 'souffle_files/warning_paths.facts'), line => {
    if (line.trim()) {
      const [source, sink, node, step, edge, prevNode, libIndex] = line.trim().split('\t').map(Number);

      const key = `${source},${sink}`;
      if (!pathsLibs.has(key)) {
        pathsLibs.set(key, []);
      }
      pathsLibs.get(key).push({ nodeId: node, lib: libIndex, edgeId: edge, prevNode: prevNode, step: step});
      warningToReported.set(key, true);

      nodePairToEdgeId.set(key, edge);
    }
  }).then(() => {
    console.log('setupAndReadAnalysisData: splitting up warning paths');
    console.log(pathsLibs.size);
    pathsLibs = separatePaths(pathsLibs, true);
    
    //  enumerate over the paths, and generate a string based on the nodes visited
    // add to reportedPaths
    for (const [key, pathObjs] of pathsLibs) {
      
      pathObjs.forEach(pathObj => {
        let path = pathObj.path;
        let pathString = path.map(node => node.nodeId).join('->');
        reportedPaths.add(pathString);
      });
    }

  }).then(() => {
    console.log('setupAndReadAnalysisData: Finished reading warning_paths.facts. Reading plausible_warning_paths.facts next.');
    return readLargeFile(path.join(ANALYSIS_PATH, 'souffle_files/plausible_warning_paths.facts'), line => {
      const [source, sink, node, step, edge, prevNode, libIndex] = line.trim().split('\t').map(Number);

      const key = `${source},${sink}`;
      
      // if (!pathsLibs.has(key)) {
      //   pathsLibs.set(key, []);
      //   pathsLibs.get(key).push({ nodeId: node, lib: libIndex, edgeId: edge, step: step, prevNode: prevNode });
      //   warningToReported.set(key, false);

      //   nodePairToEdgeId.set(key, edge);
      // }
      
      if (!plausiblePathLibs.has(key)) {
        plausiblePathLibs.set(key, []);
      }
      plausiblePathLibs.get(key).push({ nodeId: node, lib: libIndex, edgeId: edge, step: step, prevNode: prevNode });
      // warningToReported.set(key, false);
      if (!warningToReported.has(key)) {
        warningToReported.set(key, false);
      }
      nodePairToEdgeId.set(key, edge);
    

    });
  }).then(() => {
    console.log('setupAndReadAnalysisData: splitting up plausible paths');
    // console.log(plausiblePathLibs)
    plausiblePathLibs = separatePaths(plausiblePathLibs, false);

    for (const [key, pathObjs] of plausiblePathLibs) {

      if (!pathsLibs.has(key)) {
        pathsLibs.set(key, []);
      }

      
    
      pathObjs.forEach(pathObj => {

        // check if the path is already reported
        let pathString = pathObj.path.map(node => node.nodeId).join('->');
        if (reportedPaths.has(pathString)) {
          // console.log('path already reported', pathString);
          return;
        }
        pathsLibs.get(key).push(pathObj);
      });
    }

  }).then(() => {
    console.log('setupAndReadAnalysisData: Finished reading plausible_warning_paths.facts. Processing.');
    // console.log(pathsLibs);
    
    let sourceSinkPairs = Array.from(pathsLibs, ([key, value]) => {
      // console.log(value)
      const [source, sink] = key.split(',').map(Number);
      
      return { source, sink, paths: value, isSourceSinkReported: warningToReported.get(key) };
    });
    return sourceSinkPairs;
  }).then(sourceSinkPairs => {
    console.log('setupAndReadAnalysisData: Processing the data after reading both reported and plausible sourceSinkPairs.');
    const isSourceSinkReportedMap = new Map();
    sourceSinkPairs.forEach(({ source, sink, paths, isSourceSinkReported }) => {

      plausibleSources.add(source);
      plausibleSinks.add(sink);
      if (!isSourceSinkReportedMap.has(source)) {
        isSourceSinkReportedMap.set(source, new Set());
      }
      if (!isSourceSinkReportedMap.has(sink)) {
        isSourceSinkReportedMap.set(sink, new Set());
      }
      isSourceSinkReportedMap.get(source).add(isSourceSinkReported);
      isSourceSinkReportedMap.get(sink).add(isSourceSinkReported);

    });

    // log
    console.log('setupAndReadAnalysisData: plausibleSources:', plausibleSources.size);
    console.log('setupAndReadAnalysisData: plausibleSinks:', plausibleSinks.size);
    // insert sources and sinks
    Sources.batchInsert(Array.from(plausibleSources).map(source => ({ nodeId: source, isReported: [...isSourceSinkReportedMap.get(source)], description: nodeMapping[source].description })));
    Sinks.batchInsert(Array.from(plausibleSinks).map(sink => ({ nodeId: sink, isReported: [...isSourceSinkReportedMap.get(sink)], description: nodeMapping[sink].description })));

    return sourceSinkPairs;
  })
  .then(sourceSinkPairs => {
    
    console.log('setupAndReadAnalysisData: Processing the data.');
    sourceSinkPairs.forEach(({ source, sink, paths, isSourceSinkReported }) => {

      // console.log('setupAndReadAnalysisData: Processing source-sink pair:', source, sink, paths, isSourceSinkReported);
      
      paths.forEach(({isReported, path}) => {

        var nodeLibIndicesAndEdgeId = path;

        let warningNumber = codeSets.length;
        let pathNumber = codeSets.length;
      
        codeSets.push({
          warningNumber: warningNumber,
          pathNumber: pathNumber,
          reported: isReported,
          left: {
            code: '', // codeSnippetOfNodeWithHighlight(source, nodeMapping),
            nodeId: source,
            description: nodeMapping[source].description,
          },
          middle: nodeLibIndicesAndEdgeId.map(({ nodeId, lib, edgeId, prevNode }) => ({
            code: '', // codeSnippetOfNodeWithHighlight(nodeId, nodeMapping),
            nodeId: nodeId,
            lib: lib,
            edgeId: edgeId,
            description: nodeMapping[nodeId].description,
          })),
          right: {
            code: '', // codeSnippetOfNodeWithHighlight(sink, nodeMapping),
            nodeId: sink,
            description: nodeMapping[sink].description,
          },
        });
      });
      
    });

  }).then(() => {
    console.log('setupAndReadAnalysisData: Reading model.debug next.');
    return readLargeFile(path.join(ANALYSIS_PATH, 'souffle_files/model.debug'), line => {
      if (line.includes('model_node')) {
        const [name, lib] = line.split('model_node(')[1].slice(0, -1).split(',');
        libSets.set(parseInt(lib), { name: name, libId: parseInt(lib) });
      }
    })
  }).then(() => {
    console.log('setupAndReadAnalysisData: Finished reading model.debug. Reading lib_centrality.facts next.');
    return readLargeFile(path.join(ANALYSIS_PATH, 'souffle_files/lib_centrality.facts'), line => {
      const [lib, centrality, scaledCentrality] = line.split('\t');
      if (libSets.has(parseInt(lib))) {
        libSets.get(parseInt(lib)).importance = parseFloat(scaledCentrality);
      }
    });
  }).then(() => {

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
  }). then(() => {
    console.log('Finished reading the facts');
    console.log('codeSets:', codeSets.length);
    console.log('libSets:', libSets.size);

    return { codeSets, libSets };
  });
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

const lastReadFileContents = new Map();

function readLinesFromFile(file, startLine, endLine) {
  if (lastReadFileContents.has(file)) {
    const contents = lastReadFileContents.get(file);
    return contents.slice(startLine - 1, endLine).join('\n');
  } else {
    lastReadFileContents.clear();

    const lines = fs.readFileSync(file, { encoding: 'utf-8' }).split('\n');
    lastReadFileContents.set(file, lines);
    return lines.slice(startLine - 1, endLine).join('\n');

  }
  
}

function readLineFromFile(file, line) {
  let lines = fs.readFileSync(file, { encoding: 'utf-8' }).split('\n');
  return lines[line - 1];
}

function getFileLoc(nodeId, nodeMapping) {
  return { file: nodeMapping[nodeId]['file'], line: parseInt(nodeMapping[nodeId]['line']), colNum: parseInt(nodeMapping[nodeId]['column']) - 1, endColNum: parseInt(nodeMapping[nodeId]['end_column']) };
}


function executeSouffleWhy() {
  const exec = require('child_process').exec;
  const command = 'souffle -F. -D. -w why.dl -o why.csv';
  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error(`exec error: ${error}`);
      return;
    }
    console.log(`stdout: ${stdout}`);
    console.error(`stderr: ${stderr}`);
  });

}

function readDataflowJson() {
  const filepath = path.join(ANALYSIS_PATH, 'dataflow.json');
  console.log('Reading file:', filepath);
  if (!fs.existsSync(filepath)) return {};
  const data = fs.readFileSync(filepath, 'utf8');
  return JSON.parse(data);
}

Meteor.methods({
    readNodeNames() {
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
  },
  readLibMapping() {
    return readLibMapping();
  },
  readFileContents(filePath) {
    var file = fs.readFileSync(path.join(PROJECT_PATH, filePath), 'utf8');
    return file;
  },
  readGraphData() {
    const edges = [];
    const nodes = {};
    
    console.log('readGraphData: reading node mapping');
    const nodeMapping = readNodeMapping();

    console.log('readGraphData: read node mapping');
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

    console.log('readGraphData: reading edges');
    const lines = fs.readFileSync(path.join(ANALYSIS_PATH, 'souffle_files/edge.facts'), 'utf8').split('\n');
    const analysisEdges = new Set();
    lines.forEach(line => {
      if (line.trim()) {
        const [edgeId, sourceId, targetId] = line.trim().split('\t');
        analysisEdges.add(edgeId);
      }
    });

    const allEdgesLines = fs.readFileSync(path.join(ANALYSIS_PATH, 'souffle_files/plausible_edge.facts'), 'utf8').split('\n');

    // first time reading edge data?
    var isFirstTimeReadingEdges = Edges.find().count() == 0;

    // allEdgesLines = [];
    allEdgesLines
    .forEach(line => {
      if (!line.trim()) return;
      let [edgeId, sourceId, targetId] = line.split('\t');

      let sourceName = nodeMapping[parseInt(sourceId)].description;
      let targetName = nodeMapping[parseInt(targetId)].description;
      let sourceLibNode = libNodes.get(parseInt(sourceId));
      let targetLibNode = libNodes.get(parseInt(targetId));
      let warningNumber = edgeToWarningNumber.get(parseInt(edgeId));

      // map the nodes of the same lib nodes to same nodes
      // if (sourceLibNode) {
      //   console.log('mapping source', sourceId, ' to ', sourceLibNode);
      //   // copy entry over in nodeMapping
      //   nodeMapping[sourceLibNode] = nodeMapping[sourceId];
      //   sourceId = sourceLibNode;
      // }
      // if (targetLibNode) {
      //   console.log('mapping target', targetId, ' to ', targetLibNode);
      //   // copy entry over in nodeMapping
      //   nodeMapping[targetLibNode] = nodeMapping[targetId];
      //   targetId = targetLibNode;
      // }
      let isAnalysisEdge = analysisEdges.has(edgeId);
      edges.push({ edgeId, sourceId, targetId, sourceName, targetName, sourceLibNode, targetLibNode, warningNumber, isAnalysisEdge });

      if (isFirstTimeReadingEdges) {
        Edges.insert({ edgeId, sourceId, targetId, sourceName, targetName, sourceLibNode, targetLibNode, warningNumber, isAnalysisEdge });
        // console.log('edge, sourceId' + sourceId + ' targetId' + targetId + ' inserted');
      }
    });
    console.log('readGraphData: returning');

    return { nodes: nodeMapping, edges: edges };
  },
  readAllPaths() {
    const lines = fs.readFileSync(path.join(ANALYSIS_PATH, 'souffle_files/all_paths.debug'), 'utf8').split('\n');
    const paths = [];
    lines.forEach(line => {
      if (line.trim()) {
        const [source, sink, ...middle] = line.trim().split('\t');
        paths.push({ source, sink, middle });
      }
    });

  },
  runQuery(queryType, sourceId, sinkId, secondSourceId, secondSinkId, selectedAPIId) {
    console.log('Running query:', queryType,'src', sourceId, 'sink', sinkId, '2src', secondSourceId, '2sink', secondSinkId, 'api', selectedAPIId);

    // update the query file with the source and sink
    const queryFactsFile = `${ANALYSIS_PATH}/souffle_files/${queryType}.facts`;

    if (['why_node_pair', 'whynot_node_pairs'].includes(queryType)) {
      fs.writeFileSync(queryFactsFile, `${sourceId}\t${sinkId}\n`);
    } else if (['common_paths'].includes(queryType)) {
      fs.writeFileSync(queryFactsFile, `${sourceId}\t${sinkId}\t${secondSourceId}\t${secondSinkId}\n`);
    } else if (['whatif_relax', 'whatif_restrict'].includes(queryType)) {
      fs.writeFileSync(queryFactsFile, `${sourceId}\t${sinkId}\t${selectedAPIId}\n`);
    } else if (['sinks_affected'].includes(queryType)) {
      fs.writeFileSync(queryFactsFile, `${sourceId}\t${selectedAPIId}\n`);
    } else if (['global_impact'].includes(queryType)) {
      fs.writeFileSync(queryFactsFile, `${sourceId}\t${sinkId}\n`);
    }

    // Execute Souffle query
    // run shell command
    const exec = require('child_process').exec;
    const command = `souffle -F${ANALYSIS_PATH}/souffle_files -D${QUERY_RESULT_PATH} ${QUERY_PATH}/${queryType}.dl `;
    console.log(command)
    exec(command, Meteor.bindEnvironment((error, stdout, stderr) => {
      if (error) {
        console.error(`exec error: ${error}`);
        return;
      }
      
      // read the result file
      const result = fs.readFileSync(`${QUERY_RESULT_PATH}/${queryType}_answer.csv`, 'utf8');
      console.log(`stdout: ${stdout}`);
      console.error(`stderr: ${stderr}`);

      // split result by \n, then split each row by \t, read last value
      const libNodes = result.split('\n')
        .filter(row => row.trim())
        .map(row => row.split('\t').map(Number))
        .map(row => row[row.length - 1]);

      const resultNodes = fs.readFileSync(`${QUERY_RESULT_PATH}/nodes_on_path.csv`, 'utf8');
      
      const nodesOnPath = resultNodes.split('\n')
        .map(row => row.split('\t').map(Number))
        .map(row => row.slice(-3))
        .filter(row => row.length == 3);
      console.log("nodesOnPath", nodesOnPath)

      // remove old QueryResults without the same sourceId 
      QueryResults.remove({ sourceId: { '$ne' : sourceId}  });

      QueryResults.insert({ queryType, sourceId, sinkId, libNodes, nodesOnPath });

      
    }));

    return 'Query result';
  }
  
});
