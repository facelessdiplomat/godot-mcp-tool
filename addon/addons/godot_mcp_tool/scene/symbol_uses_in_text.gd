extends RefCounted

const ROOT_PATH := "."
const FUNCTION_KIND := "function"
const SIGNAL_KIND := "signal"
const VARIABLE_KIND := "variable"
const CONNECTIONS := "connections"
const METHOD_KEYS := "method_keys"
const PROPERTIES := "properties"
const ANIMATED_PATHS := "animated_paths"

const ATTRIBUTE_PATTERN := "(\\w+)=(\"([^\"]*)\"|[^\\s\\]]+)"
const RESOURCE_ID_PATTERN := "ExtResource\\(\"([^\"]+)\"\\)"


static func uses_of(text: String, request: Dictionary, scene_root_script: Callable) -> Array:
	var lines := text.split("\n")
	var script_path: String = request["script"]
	var symbol: String = request["symbol"]
	var script_ids := {}
	var scene_paths := {}
	for line in lines:
		if not line.begins_with("[ext_resource "):
			continue
		var attributes := attributes_of(line)
		if attributes.get("type") == "Script" and attributes.get("path") == script_path:
			script_ids[attributes.get("id")] = true
		elif attributes.get("type") == "PackedScene":
			scene_paths[attributes.get("id")] = attributes.get("path")
	var blocks := _blocks(lines, script_ids, scene_paths, func(scene_path: String) -> bool: return scene_root_script.call(scene_path) == script_path)
	var users := {}
	for block in blocks:
		if block["uses"]:
			users[block["path"]] = true
	var uses: Array = []
	match request["kind"]:
		FUNCTION_KIND:
			uses.append_array(_connections(lines, "to", "method", symbol, users))
			if not users.is_empty():
				uses.append_array(_method_keys(lines, symbol))
		SIGNAL_KIND:
			uses.append_array(_connections(lines, "from", "signal", symbol, users))
		VARIABLE_KIND:
			uses.append_array(_properties(lines, blocks, symbol))
			uses.append_array(_animated_paths(lines, symbol, users))
	uses.sort_custom(func(left: Dictionary, right: Dictionary) -> bool: return left["line"] < right["line"])
	return uses


static func attributes_of(line: String) -> Dictionary:
	var attributes := {}
	for found in RegEx.create_from_string(ATTRIBUTE_PATTERN).search_all(line):
		attributes[found.get_string(1)] = found.get_string(3) if found.get_string(2).begins_with("\"") else found.get_string(2)
	return attributes


static func resource_id_in(text: String) -> String:
	var found := RegEx.create_from_string(RESOURCE_ID_PATTERN).search(text)
	return found.get_string(1) if found != null else ""


static func _blocks(lines: PackedStringArray, script_ids: Dictionary, scene_paths: Dictionary, uses_scene: Callable) -> Array:
	var blocks: Array = []
	var current := {}
	for index in lines.size():
		var line := lines[index]
		if line.begins_with("["):
			if not current.is_empty():
				current["end"] = index
				blocks.append(current)
				current = {}
			if line.begins_with("[node "):
				var attributes := attributes_of(line)
				var instance_id := resource_id_in(str(attributes.get("instance", "")))
				var uses: bool = scene_paths.has(instance_id) and uses_scene.call(scene_paths[instance_id])
				current = {"start": index, "path": _node_path(attributes), "uses": uses}
			elif line.begins_with("[resource]"):
				current = {"start": index, "path": "", "uses": false}
			continue
		if not current.is_empty() and line.begins_with("script = "):
			current["uses"] = script_ids.has(resource_id_in(line.trim_prefix("script = ")))
	if not current.is_empty():
		current["end"] = lines.size()
		blocks.append(current)
	return blocks


static func _connections(lines: PackedStringArray, node_attribute: String, name_attribute: String, symbol: String, users: Dictionary) -> Array:
	var found: Array = []
	for index in lines.size():
		if not lines[index].begins_with("[connection "):
			continue
		var attributes := attributes_of(lines[index])
		if attributes.get(name_attribute) == symbol and users.has(attributes.get(node_attribute)):
			found.append(_use(index, CONNECTIONS, 1, attributes.get(node_attribute)))
	return found


static func _method_keys(lines: PackedStringArray, symbol: String) -> Array:
	var found: Array = []
	var key := "\"method\": &\"%s\"" % symbol
	for index in lines.size():
		var count := lines[index].count(key)
		if count > 0:
			found.append(_use(index, METHOD_KEYS, count, ""))
	return found


static func _properties(lines: PackedStringArray, blocks: Array, symbol: String) -> Array:
	var found: Array = []
	var assignment := symbol + " = "
	for block in blocks:
		if not block["uses"]:
			continue
		for index in range(block["start"] + 1, block["end"]):
			if lines[index].begins_with(assignment):
				found.append(_use(index, PROPERTIES, 1, block["path"]))
	return found


static func _animated_paths(lines: PackedStringArray, symbol: String, users: Dictionary) -> Array:
	var found: Array = []
	var animated_path := RegEx.create_from_string("NodePath\\(\"([^\":]*):%s\"\\)" % symbol)
	for index in lines.size():
		for path in animated_path.search_all(lines[index]):
			if users.has(path.get_string(1)):
				found.append(_use(index, ANIMATED_PATHS, 1, path.get_string(1)))
	return found


static func _use(index: int, kind: String, count: int, node: String) -> Dictionary:
	return {"line": index + 1, "kind": kind, "count": count, "node": node}


static func _node_path(attributes: Dictionary) -> String:
	if not attributes.has("parent"):
		return ROOT_PATH
	var parent: String = attributes["parent"]
	return attributes.get("name", "") if parent == ROOT_PATH else "%s/%s" % [parent, attributes.get("name", "")]
