import subprocess
import re
import yaml
import os
from collections import defaultdict
import sys
import shutil
# This script extracts the analysis facts from the bqrs files and the models

# python3 extract_analysis_facts.py <path to codeql> <path to bqrs file> <path to fact creator jar> <path to project>
# e.g. python3 extract_analysis_facts.py  /Users/hongjinkang/repos/codeql_exp/codeql/codeql /Users/hongjinkang/repos/codeql_exp/file.bqrs  /Users/hongjinkang/repos/codeql_exp/codeql/codeql /Users/hongjinkang/repos/codeql_exp/all.bqrs  /Users/hongjinkang/eclipse-workspace/factcreator/target/factcreator-0.0.1-SNAPSHOT-jar-with-dependencies.jar /Users/hongjinkang/repos/codeql_exp/OpenUnison/unison /Users/hongjinkang/.m2/repository/

arg_codeql_path = sys.argv[1]
arg_bqrs_path = sys.argv[2]
arg_all_facts_bqrs_path = sys.argv[3]
arg_fact_creator_path = sys.argv[4]
arg_path_to_project = sys.argv[5]
arg_path_to_models = sys.argv[6]
arg_path_to_m2 = sys.argv[7]

class bcolors:
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'


def generate_facts_from_models(data_dict, fact_index):
    def generate_summary_fact(item, fqn_to_fact, model_packages):
        
        package_class = f"{item[0]}.{item[1]}"
        extensible_type = 'summary'
        model_packages.append(item[0])

        method = item[3].replace('()', '').replace('(', '__').replace(')', '__')
        parameters = item[4]
        label = item[6]
        second_label = item[8] if len(item) > 8 else None

        if second_label:
            first_label_formatted = f"arg{label.split('[')[1].split(']')[0]}" if 'Argument' in label else 'returnValue'
            second_label_formatted = f"arg{second_label.split('[')[1].split(']')[0]}" if 'Argument' in second_label else 'returnValue'
            fact = f"library_flow({package_class}.{method}{parameters}__{first_label_formatted}, {package_class}.{method}__{second_label_formatted}, {fact_index})"

            fact_tuple = ('library_flow', f"{package_class}.{method} {parameters}", first_label_formatted,  f"{package_class}.{method}{parameters}", second_label_formatted)
            fqn_to_fact[f"{package_class}.{method} {parameters}"].append( {
                'fact': fact,
                'fact_tuple': fact_tuple,
                'fact_index' : fact_index
            } )
            
        elif label == 'ReturnValue':
            fact = f"{extensible_type}({package_class}.{method}{parameters}__returnValue, {fact_index})"

            fact_tuple = (extensible_type, f"{package_class}.{method} {parameters}", 'returnValue')
            fqn_to_fact[f"{package_class}.{method} {parameters}"].append( {
                'fact': fact,
                'fact_tuple': fact_tuple,
                'fact_index' : fact_index
            } )
            
        elif label.startswith('Argument'):
            if '[' in label and ']' in label:
                label_formatted = 'arg' + label.split('[')[1].split(']')[0]
                fact = f"{extensible_type}({package_class}.{method}__{label_formatted}, {fact_index})"

                fact_tuple = (extensible_type, f"{package_class}.{method} {parameters}", label_formatted)

                fqn_to_fact[f"{package_class}.{method} {parameters}"].append( {
                    'fact': fact,
                    'fact_tuple': fact_tuple,
                    'fact_index' : fact_index
                } )
                
        return fact
    
    def generate_fact(typ, item, fqn_to_fact, model_packages):
        package_class = f"{item[0]}.{item[1]}"
        model_packages.append(item[0])

        method = item[3].replace('()', '').replace('(', '__').replace(')', '__')
        parameters = item[4]
        label = item[6]

        first_label_formatted = f"arg{label.split('[')[1].split(']')[0]}" if 'Argument' in label else 'returnValue'
        fact = f"{typ}({package_class}.{method}{parameters}__{first_label_formatted}, {fact_index})"

        fact_tuple = (f'{typ}', f"{package_class}.{method} {parameters}",first_label_formatted, )
        fqn_to_fact[f"{package_class}.{method} {parameters}"].append( {
            'fact': fact,
            'fact_tuple': fact_tuple,
            'fact_index' : fact_index
        } )
        return fact
    
        
    facts = []
    fqn_to_fact = defaultdict(list)
    model_packages = []

    for extension in data_dict['extensions']:
        extensible_type = extension['addsTo']['extensible'][:-5]  # strip "Model" 
        for item in extension['data']:
            fact = None
            if extensible_type == 'summary':   
                fact = generate_summary_fact(item, fqn_to_fact, model_packages)
            elif extensible_type == 'source':
                fact = generate_fact('source', item, fqn_to_fact, model_packages)
            elif extensible_type == 'sink':
                fact = generate_fact('sink', item, fqn_to_fact, model_packages)
            if fact is not None:
                
                facts.append(fact)
                fact_index += 1

    return facts, fqn_to_fact, model_packages


def decode_bqrs(bqrs_file_path):
    command = [
        # '/Users/hongjinkang/repos/codeql_exp/codeql/codeql', 
        # 'codeql' # sys.argv[1]
        arg_codeql_path,
        'bqrs', 'decode', ' --entities=all',
        bqrs_file_path
    ]

    result = subprocess.run(' '.join(command), shell=True, text=True, capture_output=True)
    output = result.stdout
    # print(output)
    # print(result.stderr)

    node_edges_parts = output.split("Result set: nodes")
    edges_part = node_edges_parts[0]
    nodes_part = node_edges_parts[1].split('Result set: subpaths')[0]

    # we also want the #select results
    # which seem to correspond to the warnings
    select_results = output.split("Result set: #select")[1]

    edge_pattern = re.compile(
    r"\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|")
    edges = edge_pattern.findall(edges_part)
    edges = [ (int(edge[0]), int(edge[3])) for edge in edges]

    # dedup edges by their edge id
    edges = list(set(edges))

    node_map = {}
    node_pattern = re.compile(
    r"\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|")
    nodes = node_pattern.findall(nodes_part)

    for node in nodes:            
        node_map[int(node[0])] = (node[2], node[4].replace('\n', ' ').replace(',', ' '))


    select_sources_and_sinks_pattern = re.compile(r'\|\s+\d+\s+\|[^|]+\|\s+file:\/\/[^\|]+\|\s+(\d+)\s+\|[^|]+\|\s+file:\/\/[^\|]+\|\s+(\d+)\s+\|')
    select_sources_and_sinks = select_sources_and_sinks_pattern.findall(select_results)

    warning_sources_and_sinks = []
    for source, sink in select_sources_and_sinks:
        warning_sources_and_sinks.append((int(source), int(sink)))

    return node_map, edges, warning_sources_and_sinks



bqrs_file_path = arg_bqrs_path
analysis_nodes, analysis_edges, warning_sources_and_sinks = decode_bqrs(bqrs_file_path)

all_nodes, all_edges, all_plausible_warning_sources_and_sinks = decode_bqrs(arg_all_facts_bqrs_path)
# convert analysis_nodes, analysis_edges to use the same indexing as all_nodes, all_edges by comparing the keys by their values
def map_analysis_ids_to_ids_in_general_query(analysis_nodes, analysis_edges, warning_sources_and_sinks, all_nodes):
    updated_analysis_nodes = {}
    node_id_mapping = {}
    updated_analysis_edges = []
    for key, value in analysis_nodes.items():
        for all_key, all_value in all_nodes.items():
            if value == all_value:
                updated_analysis_nodes[all_key] = value
                node_id_mapping[key] = all_key

                break

    for edge in analysis_edges:
        updated_analysis_edges.append((node_id_mapping[edge[0]], node_id_mapping[edge[1]]))

    updated_warning_sources_and_sinks = []
    for source, sink in warning_sources_and_sinks:
        updated_warning_sources_and_sinks.append((node_id_mapping[source], node_id_mapping[sink]))

    return updated_analysis_nodes,updated_analysis_edges, updated_warning_sources_and_sinks

analysis_nodes, analysis_edges, warning_sources_and_sinks = map_analysis_ids_to_ids_in_general_query(analysis_nodes, analysis_edges, warning_sources_and_sinks, all_nodes)

files_to_analyze_path = 'files_to_analyze.txt'

with open(files_to_analyze_path ,'w+') as outfile:
    files = []
    for node_i, node in all_nodes.items():
        # print(node[0])
        if '.java:' not in node[0]:
            continue
        files.append(node[0].split('file://')[1].split(':')[0])
     
    files = set(files)
    for file in files:
        outfile.write(file + '\n')

# run jar file
command = [
    'java', '-jar', 
    arg_fact_creator_path,
    files_to_analyze_path, 
    # arg_path_to_project]
    # "/Users/hongjinkang/.m2/repository/"]
    arg_path_to_m2]
print(' '.join(command))
result = subprocess.run(' '.join(command), shell=True, text=True, capture_output=True)

# the fact creator writes into fqn_and_arg_positions directory

map_of_file_to_col_line_to_fqn = {}
map_of_file_to_col_line_to_arg_position = {}
for file in os.listdir('fqn_and_arg_positions'):
    if file.endswith('.txt'):
            
        with open('fqn_and_arg_positions/' + file, 'r') as infile:
            lines = infile.readlines()
            for line in lines:

                if ':' not in line:
                    continue
                line = line.strip()

                value = line.split('=')[1]
                # print(fqn)
                parts = line.split(':')
                line_number = int(parts[0])
                col_number = int(parts[1])
                end_line_number = int(parts[2])
                end_col_number = int(parts[3].split('=')[0])

 
                map_of_file_to_col_line_to_arg_position[file] = map_of_file_to_col_line_to_arg_position.get(file, {})
                map_of_file_to_col_line_to_fqn[file] = map_of_file_to_col_line_to_fqn.get(file, {})
                if '#' in value:
                    
                    map_of_file_to_col_line_to_arg_position[file][(line_number, col_number, end_line_number, end_col_number)] = value
                else:
                    # print(value, line_number, col_number, end_line_number, end_col_number)
                    
                    map_of_file_to_col_line_to_fqn[file][(line_number, col_number, end_line_number, end_col_number)] = value

print('filled mapping of map_of_file_to_col_line_to_fqn and map_of_file_to_col_line_to_arg_position')


all_model_facts = []
fqn_to_fact = {}
all_model_packages = set()
for file in os.listdir(arg_path_to_models):
    
    if not file.endswith('.yml'):
        continue
    with open(arg_path_to_models + '/' + file, 'r') as infile:
        data = yaml.safe_load(infile)

        model_facts, fqn_to_fact_data, model_packages = generate_facts_from_models(data, len(all_model_facts))
        all_model_facts.extend(model_facts)
        fqn_to_fact.update(fqn_to_fact_data)
        all_model_packages = all_model_packages.union(set(model_packages))

print('filled mapping of fqn_to_fact')

# map node to fqn
def match_fqn(map_of_file_to_col_line_to_fqn, node):
    file = node[0].split('file://')[1].split(':')[0]
    
    line = int(node[0].split('file://')[1].split(':')[1])
    col = int(node[0].split('file://')[1].split(':')[2]) 
    end_line = int(node[0].split('file://')[1].split(':')[3])
    end_col = int(node[0].split('file://')[1].split(':')[4]) 

    file_key = file.split('src')[1][1:].replace('/', '.').replace('\\', '.') + '.txt'
    # print(file_key)

    found = False
    # try all combinations where we can be off-by-one
    # TODO: this is just sad and inefficient, so let's fix this one day
    for line_offset in [ 0]:
        for col_offset in [-1, 0, 1]:
            fqn = map_of_file_to_col_line_to_fqn[file_key].get((line + line_offset, col + col_offset, end_line + line_offset, end_col + col_offset), None)
            if fqn is not None:
                found = True
                break
        if found:
            break
    if not found:
        print('could not find fqn for', node, file_key)
    return fqn

def match_arg_position(map_of_file_to_col_line_to_arg_position, node):
    file = node[0].split('file://')[1].split(':')[0]
    
    line = int(node[0].split('file://')[1].split(':')[1])
    col = int(node[0].split('file://')[1].split(':')[2]) 
    end_line = int(node[0].split('file://')[1].split(':')[3])
    end_col = int(node[0].split('file://')[1].split(':')[4]) 
    
    
    file_key = file.split('src')[1][1:].replace('/', '.').replace('\\', '.') + '.txt'

    found = False
    # try all combinations where we can be off-by-one
    for line_offset in [ 0,]:
        for col_offset in [-1, 0, 1]:
            pos = map_of_file_to_col_line_to_arg_position[file_key].get((line + line_offset, col + col_offset, end_line + line_offset, end_col + col_offset), None)
            if pos is not None:
                found = True
                break
        if found:
            break
    
    return pos


souffle_facts = []
facts_debugging_logs = []
for node in all_nodes.keys():
    souffle_facts.append('node(' + str(node) + ')')
    facts_debugging_logs.append('node(' + str(node) + ') -> ' + str(all_nodes[node]) + '\n')

# write nodes to another file for easy debugging
with open('souffle_files/nodes.debug', 'w+') as outfile:
    for node in all_nodes.keys():
        path, symbol = all_nodes[node]
    
        # full_path = path.split('file://')[1].split(':')[0]
        print(path, arg_path_to_project)
        relative_path = path.split(arg_path_to_project)[1]

        line_number = int(all_nodes[node][0].split('file://')[1].split(':')[1])
        col_number = int(all_nodes[node][0].split('file://')[1].split(':')[2])
        end_line_number = int(all_nodes[node][0].split('file://')[1].split(':')[3])
        end_col_number = int(all_nodes[node][0].split('file://')[1].split(':')[4])
        outfile.write(str(node) + ',' + relative_path + ',' + str(line_number) + ',' + str(col_number) + ',' + str(end_line_number) + ',' + str(end_col_number) +',' + symbol + '\n')


model_nodes = {}
model_fqns = []

for edge_index, edge in enumerate(all_edges):
    source_node = all_nodes[edge[0]]
    target_node = all_nodes[edge[1]]

    if edge in analysis_edges:
        souffle_facts.append('edge('  + str(edge_index) + ',' +  str(edge[0]) + ',' + str(edge[1]) + ')')
        facts_debugging_logs.append('edge('  + str(edge_index) + ',' +  str(edge[0]) + ',' + str(edge[1]) + ') -> ' + str(source_node) + ' -> ' + str(target_node) + '\n')
        souffle_facts.append('plausible_edge('  + str(edge_index) + ',' +  str(edge[0]) + ',' + str(edge[1]) + ')')
        facts_debugging_logs.append('plausible_edge('  + str(edge_index) + ',' +  str(edge[0]) + ',' + str(edge[1]) + ') -> ' + str(source_node) + ' -> ' + str(target_node) + '\n')
    else:
        souffle_facts.append('plausible_edge('  + str(edge_index) + ',' +  str(edge[0]) + ',' + str(edge[1]) + ')')
        facts_debugging_logs.append('plausible_edge('  + str(edge_index) + ',' +  str(edge[0]) + ',' + str(edge[1]) + ') -> ' + str(source_node) + ' -> ' + str(target_node) + '\n')
    # print(f"{bcolors.OKCYAN}Source{bcolors.ENDC}", source_node)
    # print(f"{bcolors.OKCYAN}Target{bcolors.ENDC}", target_node)
    # print()

    if '.java:' in source_node[0] and 'src' in source_node[0]:
        try:
            source_fqn = match_fqn(map_of_file_to_col_line_to_fqn, source_node)
        except:
            source_fqn = None
    else:
        source_fqn = None
    if '.java:' in target_node[0] and 'src' in target_node[0]:
        try:
            target_fqn = match_fqn(map_of_file_to_col_line_to_fqn, target_node)
        except:
            target_fqn = None
    else:
        target_fqn = None

    # if node matches package in model_packages, then add the fact that edges from node can become library flows
    # print(source_node, source_fqn)
    for model_package in all_model_packages:
        index_offset = len(all_model_facts)
        if source_fqn and model_package in source_fqn:
            if source_fqn not in model_fqns:
                model_fqns.append(source_fqn)
            
            model_nodes[edge[0]] = (source_fqn, index_offset + model_fqns.index(source_fqn))



    # print(f"{bcolors.OKGREEN}Source FQN{bcolors.ENDC}")
    # print(source_fqn)
    # print(f"{bcolors.OKGREEN}Target FQN{bcolors.ENDC}")
    # print(target_fqn)

    if '.java:' in source_node[0] and 'src' in source_node[0]:
        try:
            source_arg_position = match_arg_position(map_of_file_to_col_line_to_arg_position, source_node)
        except:
            source_arg_position = None
    else:
        source_arg_position = None
    if '.java:' in target_node[0] and 'src' in target_node[0]:
        try:
            target_arg_position = match_arg_position(map_of_file_to_col_line_to_arg_position, target_node)
        except:
            target_arg_position = None
    else:
        target_arg_position = None

    # source_fqn = source_fqn.split(' ')[0] if source_fqn else None
    # target_fqn = target_fqn.split(' ')[0] if target_fqn else None

    # match fqn to fact
    source_fact = fqn_to_fact.get(source_fqn, None)    
    target_fact = fqn_to_fact.get(target_fqn, None)
    
    # if target_fact:
    #     print('src>>',source_node)
    #     print(target_fqn)


    if target_fact:
        # library taint from argthis / arg0 ... to its return value
        # match return value now
        for fact in target_fact:
            
            if fact['fact_tuple'][1] == target_fqn:
                # print(f"{bcolors.OKGREEN}Source Fact{bcolors.ENDC}")
                # print(fact['fact_tuple'])
                # print('source', source_arg_position)
                # print('source', source_arg_position)
                # print(f"{bcolors.OKGREEN}Target Fact{bcolors.ENDC}")

                # if target_fact:
                #         print(source_node)
                #         print(target_fqn)
                #         print(fact['fact_tuple'])
                #         print(source_arg_position)
                # match arg position
                if fact['fact_tuple'][0] == 'library_flow' and source_arg_position is not None and fact['fact_tuple'][2] == 'arg' + source_arg_position.split('#')[1]:
                    # print(fact['fact'])
                    if edge in analysis_edges:
                        souffle_facts.append('library_flow(' + str(edge_index) + ',' + str(fact['fact_index']) + ')')
                        facts_debugging_logs.append('library_flow(' + str(edge_index) + ',' + str(fact['fact_index']) + ') -> ' + fact['fact'] + '\n')
                    else:
                        souffle_facts.append('hypothetical_library_flow(' + str(edge_index) + ',' + str(fact['fact_index']) + ')')
                        facts_debugging_logs.append('hypothetical_library_flow(' + str(edge_index) + ',' + str(fact['fact_index']) + ') -> ' + fact['fact'] + '\n')

print('filled library flows')

for model_node, (model_fqn, model_index) in model_nodes.items():
    model_node_fact = 'model_node(' + str(model_node) + ', ' + str(model_index) +  ')'
    if model_node_fact not in souffle_facts:
        souffle_facts.append(model_node_fact)
        facts_debugging_logs.append('model_node(' + str(model_node) + ', ' + str(model_index)  + ') -> ' + str(all_nodes[model_node]) + ' , ' + model_fqn + '\n')          
        if 'model_node(' + model_fqn  + ',' + str(model_index)  + ')' not in all_model_facts:
            all_model_facts.append('model_node(' + model_fqn  + ',' + str(model_index)  + ')')

print('filled model nodes')
# find all nodes that can be sources
for node in all_nodes.keys():
    if '.java:' in all_nodes[node][0] and 'src' in all_nodes[node][0]:
        try:
            fqn = match_fqn(map_of_file_to_col_line_to_fqn, all_nodes[node])
        except:
            fqn = None
    else:
        fqn = None

    if '.java:' in all_nodes[node][0] and 'src' in all_nodes[node][0]:
        try:
            arg_position = match_arg_position(map_of_file_to_col_line_to_arg_position, all_nodes[node])
        except:
            arg_position = None
    else:
        arg_position = None

    # fqn = fqn.split(' ')[0] if fqn else None
    facts = fqn_to_fact.get(fqn, [])
    # print('checking sources', node, fqn, arg_position, len(facts))
    for fact in facts:
        # print('check fact', fact)
        # if fact['fact_tuple'][0] == 'source':
            # print('source' , fact['fact_tuple'])
        if fact['fact_tuple'][1] == fqn and fact['fact_tuple'][0] == 'source':
            souffle_facts.append('source(' + str(node) + ')')
            facts_debugging_logs.append('source(' + str(node) + ') -> ' + fact['fact'] + '\n')
            

print('filled sources')
# find nodes that can be sinks.
# this is trickier than sources, because codeql's output node doesn't give us the FQN of the method ( so we can't match FQNs against known sinks)
# so we have to rely on the fact that the node is an argument to the sink method, and use the information we stored using the fact creator in map_of_file_to_col_line_to_arg_position
sink_facts = [ model_fact for  model_fact in all_model_facts if model_fact.startswith('sink')]

for edge in all_edges:
    if '.java:' in all_nodes[edge[1]][0] and 'src' in all_nodes[edge[1]][0]:
        try:
            arg_position = match_arg_position(map_of_file_to_col_line_to_arg_position, all_nodes[edge[1]])
        except:
            arg_position = None
        if arg_position is None:
            continue
    else:
        continue

    fqn_of_arg = arg_position.split('#')[0] if arg_position else arg_position

    facts = fqn_to_fact.get(arg_position.split('#')[0], [])
    for fact in facts:
        if fact['fact_tuple'][0] == 'sink' and fact['fact_tuple'][2] == 'arg' + arg_position.split('#')[1]:
            souffle_facts.append('sink(' + str(edge[1]) + ')')
            facts_debugging_logs.append('sink(' + str(edge[1]) + ') -> ' + fact['fact'] + '\n')
            # print(fact['fact_tuple'])

print('filled sinks')

with open('souffle_files/model.debug', 'w+') as outfile:
    for model_fact in all_model_facts:
        outfile.write(model_fact + '\n')
        # we only have to write the source and sinks, flows are already written
        if model_fact.startswith('source'):
            facts_debugging_logs.append(model_fact + '\n')
        elif model_fact.startswith('sink'):
            facts_debugging_logs.append(model_fact + '\n')

for pair_i, (warning_sources, warning_sinks) in enumerate(warning_sources_and_sinks):
    souffle_facts.append('warning(' + str(pair_i) + ',' + str(warning_sources) + ',' + str(warning_sinks) + ')')
    facts_debugging_logs.append('warning(' + str(pair_i) + ',' + str(warning_sources) + ',' + str(warning_sinks) + ') -> ' + str(all_nodes[warning_sources]) + ' -> ' + str(analysis_nodes[warning_sinks]) + '\n')

for pair_i, (warning_sources, warning_sinks) in enumerate(all_plausible_warning_sources_and_sinks):
    souffle_facts.append('plausible_warning(' + str(pair_i) + ',' + str(warning_sources) + ',' + str(warning_sinks) + ')')
    facts_debugging_logs.append('plausible_warning(' + str(pair_i) + ',' + str(warning_sources) + ',' + str(warning_sinks) + ') -> ' + str(all_nodes[warning_sources]) + ' -> ' + str(all_nodes[warning_sinks]) + '\n')

with    open('souffle_files/edge.facts', 'w+')                  as edges_outfile,\
        open('souffle_files/node.facts', 'w+')                  as nodes_outfile,\
        open('souffle_files/plausible_edge.facts', 'w+')        as hypo_edges_outfile,\
        open('souffle_files/plausible_warning.facts', 'w+')     as hypo_warnings_outfile,\
        open('souffle_files/library_flow.facts', 'w+')          as library_flow_outfile, \
        open('souffle_files/hypothetical_library_flow.facts', 'w+') as hypo_library_flow_outfile, \
        open('souffle_files/library_node.facts', 'w+')          as library_node_outfile, \
        open('souffle_files/warning.facts', 'w+')               as warning_outfile, \
        open('souffle_files/old_source.facts', 'w+')                as source_outfile,\
        open('souffle_files/old_sink.facts', 'w+')                  as sink_outfile,\
        open('souffle_files/all.debug' , 'w+')                  as debug_outfile:
    for fact, debug_info in zip(souffle_facts, facts_debugging_logs):
        debug_outfile.write(fact.replace('\n', ' ').replace(',', ' '))
        if fact.startswith('edge'):
            fact = fact.split('edge')[1].replace('(', '').replace(')', '').replace(',', '\t')
            edges_outfile.write(fact + '\n')
        elif 'plausible_edge' in fact:
            fact = fact.split('plausible_edge')[1].replace('(', '').replace(')', '').replace(',', '\t')
            hypo_edges_outfile.write(fact + '\n')
        elif 'model_node' in fact:
            fact = fact.split('model_node')[1].replace('(', '').replace(')', '').replace(',', '\t')
            library_node_outfile.write(fact + '\n')
        elif 'node' in fact:
            fact = fact.split('node')[1].replace('(', '').replace(')', '').replace(',', '\t')
            nodes_outfile.write(fact + '\n')

        elif fact.startswith('library_flow'):
            fact = fact.split('library_flow')[1].replace('(', '').replace(')', '').replace(',', '\t')
            library_flow_outfile.write(fact + '\n')
        elif 'hypothetical_library_flow' in fact:
            fact = fact.split('hypothetical_library_flow')[1].replace('(', '').replace(')', '').replace(',', '\t')
            hypo_library_flow_outfile.write(fact + '\n')
        elif 'plausible_warning' in fact:
            fact = fact.split('plausible_warning')[1].replace('(', '').replace(')', '').replace(',', '\t')
            hypo_warnings_outfile.write(fact + '\n')
        elif 'warning' in fact:
            fact = fact.split('warning')[1].replace('(', '').replace(')', '').replace(',', '\t')
            warning_outfile.write(fact + '\n')
        elif 'source' in fact:
            fact = fact.split('source(')[1].replace('(', '').replace(')', '').replace(',', '\t')
            source_outfile.write(fact + '\n')
        elif 'sink' in fact:
            fact = fact.split('sink(')[1].replace('(', '').replace(')', '').replace(',', '\t')
            sink_outfile.write(fact + '\n')
        
        debug_outfile.write(' -> ' + fact + ' , ' + debug_info + '\n')
        

# Run the other analysis that are usually used
# souffle -F souffle_files -D.  souffle_queries/all_warning_paths.dl
def compute_all_paths():
    print('computing all paths')
    command = [
        'souffle', '-F', 'souffle_files', '-D.', 'souffle_queries/all_warning_paths.dl'
    ]
    result = subprocess.run(' '.join(command), shell=True, text=True, capture_output=True)
    
    print(result.stdout)
    print(result.stderr)

    print('computing plausible paths')
    command = [
        'souffle', '-F', 'souffle_files', '-D.', 'souffle_queries/all_plausible_warning_paths.dl'
    ]
    result = subprocess.run(' '.join(command), shell=True, text=True, capture_output=True)
    
    print(result.stdout)
    print(result.stderr)

    # move and rename the output files into souffle_files
    shutil.copyfile('warning_paths.csv', 'souffle_files/warning_paths.facts')
    shutil.copyfile('library_paths_count.csv', 'souffle_files/library_paths_count.facts')

    shutil.copyfile('plausible_warning_paths.csv', 'souffle_files/plausible_warning_paths.facts')

    print('identifying existing sanitizers')
    command = [
        'souffle', '-F', 'souffle_files', '-D.', 'souffle_queries/compare_and_find_sanitizers.dl'
    ]
    result = subprocess.run(' '.join(command), shell=True, text=True, capture_output=True)
    
    print(result.stdout)
    print(result.stderr)
    os.rename('sanitizers.csv', 'souffle_files/sanitizer.facts')

compute_all_paths()

    
print(f"{bcolors.OKGREEN}Done{bcolors.ENDC}")        
print("wrote to souffle_files/*")
print("Next, you should run souffle with the input directory `souffle_files`")

