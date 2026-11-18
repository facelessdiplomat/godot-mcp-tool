extends RefCounted

const ROOT_PATH := "."
const FUNCTION_KIND := "function"
const SIGNAL_KIND := "signal"
const VARIABLE_KIND := "variable"

const ATTRIBUTE_PATTERN := "(\\w+)=(\"([^\"]*)\"|[^\\s\\]]+)"
const RESOURCE_ID_PATTERN := "ExtResource\\(\"([^\"]+)\"\\)"


static func renamed(text: String, request: Dictionary, scene_root_script: Callable) -> Dictionary:
	var lines := text.split("\n")
	var script_path: String = request["script"]
	var symbol: String = request["symbol"]
	var new_name: String = request["new_name"]
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
	var changes := {}
	match request["kind"]:
		FUNCTION_KIND:
			_rename_connections(lines, "to", "method", symbol, new_name, users, changes)
			if not users.is_empty():
				_rename_method_keys(lines, symbol, new_name, changes)
		SIGNAL_KIND:
			_rename_connections(lines, "from", "signal", symbol, new_name, users, changes)
		VARIABLE_KIND:
			_rename_properties(lines, blocks, symbol, new_name, changes)
			_rename_animated_paths(lines, symbol, new_name, users, changes)
	return {"text": "\n".join(lines), "changes": changes}


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


static func _rename_connections(lines: PackedStringArray, node_attribute: String, name_attribute: String, symbol: String, new_name: String, users: Dictionary, changes: Dictionary) -> void:
	for index in lines.size():
		var line := lines[index]
		if not line.begins_with("[connection "):
			continue
		var attributes := attributes_of(line)
		if attributes.get(name_attribute) == symbol and users.has(attributes.get(node_attribute)):
			lines[index] = line.replace("%s=\"%s\"" % [name_attribute, symbol], "%s=\"%s\"" % [name_attribute, new_name])
			_count(changes, "connections", 1)


static func _rename_method_keys(lines: PackedStringArray, symbol: String, new_name: String, changes: Dictionary) -> void:
	var old_key := "\"method\": &\"%s\"" % symbol
	for index in lines.size():
		var found := lines[index].count(old_key)
		if found > 0:
			lines[index] = lines[index].replace(old_key, "\"method\": &\"%s\"" % new_name)
			_count(changes, "method_keys", found)


static func _rename_properties(lines: PackedStringArray, blocks: Array, symbol: String, new_name: String, changes: Dictionary) -> void:
	var assignment := symbol + " = "
	for block in blocks:
		if not block["uses"]:
			continue
		for index in range(block["start"] + 1, block["end"]):
			if lines[index].begins_with(assignment):
				lines[index] = new_name + lines[index].substr(symbol.length())
				_count(changes, "properties", 1)


static func _rename_animated_paths(lines: PackedStringArray, symbol: String, new_name: String, users: Dictionary, changes: Dictionary) -> void:
	var animated_path := RegEx.create_from_string("NodePath\\(\"([^\":]*):%s\"\\)" % symbol)
	for index in lines.size():
		for found in animated_path.search_all(lines[index]):
			if users.has(found.get_string(1)):
				lines[index] = lines[index].replace(found.get_string(), "NodePath(\"%s:%s\")" % [found.get_string(1), new_name])
				_count(changes, "animated_paths", 1)


static func attributes_of(line: String) -> Dictionary:
	var attributes := {}
	for found in RegEx.create_from_string(ATTRIBUTE_PATTERN).search_all(line):
		attributes[found.get_string(1)] = found.get_string(3) if found.get_string(2).begins_with("\"") else found.get_string(2)
	return attributes


static func resource_id_in(text: String) -> String:
	var found := RegEx.create_from_string(RESOURCE_ID_PATTERN).search(text)
	return found.get_string(1) if found != null else ""


static func _node_path(attributes: Dictionary) -> String:
	if not attributes.has("parent"):
		return ROOT_PATH
	var parent: String = attributes["parent"]
	return attributes.get("name", "") if parent == ROOT_PATH else "%s/%s" % [parent, attributes.get("name", "")]


static func _count(changes: Dictionary, key: String, amount: int) -> void:
	changes[key] = changes.get(key, 0) + amount
