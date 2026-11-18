extends "../command.gd"

const GodotMcpEditingContext := preload("../../scene/editing_context.gd")
const GodotMcpParams := preload("../params.gd")
const GodotMcpSymbolRenameInText := preload("../../scene/symbol_rename_in_text.gd")

const RESOURCE_EXTENSIONS := ["tscn", "tres"]
const SKIPPED_FOLDERS := ["res://addons", "res://.godot"]
const KINDS := ["function", "signal", "variable", "other"]
const IDENTIFIER_PATTERN := "^[A-Za-z_][A-Za-z0-9_]*$"

var _context: GodotMcpEditingContext
var _identifier := RegEx.create_from_string(IDENTIFIER_PATTERN)


func _init(context: GodotMcpEditingContext) -> void:
	_context = context


func execute(params: Dictionary) -> Variant:
	var script_path: Variant = GodotMcpParams.required_text(params, "script", "\"res://enemy.gd\"")
	var symbol: Variant = GodotMcpParams.required_text(params, "symbol", "\"take_damage\"")
	var new_name: Variant = GodotMcpParams.required_text(params, "new_name", "\"apply_damage\"")
	var kind: Variant = GodotMcpParams.text(params, "kind", "function")
	for value in [script_path, symbol, new_name, kind]:
		if value is GodotMcpCommandError:
			return value
	if not kind in KINDS:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "Unknown kind \"%s\"; use one of: %s" % [kind, ", ".join(PackedStringArray(KINDS))])
	if not _identifier.search(new_name) or not _identifier.search(symbol):
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "\"%s\" and \"%s\" must both be names of letters, digits and _" % [symbol, new_name])
	var request := {"script": script_path, "symbol": symbol, "new_name": new_name, "kind": kind}
	var root_scripts := {}
	var updated: Array = []
	for path in _resource_files("res://"):
		var text := FileAccess.get_file_as_string(path)
		if not text.contains(symbol):
			continue
		var result := GodotMcpSymbolRenameInText.renamed(text, request, _root_script_of.bind(root_scripts))
		if not (result["changes"] as Dictionary).is_empty():
			updated.append({"path": path, "text": result["text"], "changes": result["changes"]})
	for entry in updated:
		var open_root := _context.scenes.find_open_root(entry["path"])
		if open_root != null and _context.scenes.access.is_scene_unsaved(open_root):
			return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "%s has unsaved changes in the editor" % entry["path"], "Save it with scene_save first, then rename again.")
	for entry in updated:
		var file := FileAccess.open(entry["path"], FileAccess.WRITE)
		file.store_string(entry["text"])
		file.close()
		if _context.scenes.find_open_root(entry["path"]) != null:
			_context.scenes.access.reload_scene(entry["path"])
	return {"files": updated.map(func(entry: Dictionary) -> Dictionary: return {"path": entry["path"], "changes": entry["changes"]})}


static func _resource_files(directory: String) -> PackedStringArray:
	var found := PackedStringArray()
	if directory in SKIPPED_FOLDERS:
		return found
	for file_name in DirAccess.get_files_at(directory):
		if file_name.get_extension() in RESOURCE_EXTENSIONS:
			found.append(directory.path_join(file_name))
	for folder in DirAccess.get_directories_at(directory):
		if not folder.begins_with("."):
			found.append_array(_resource_files(directory.path_join(folder)))
	return found


static func _root_script_of(scene_path: String, cache: Dictionary) -> String:
	if cache.has(scene_path):
		return cache[scene_path]
	cache[scene_path] = ""
	var script_paths := {}
	var scene_paths := {}
	var in_root := false
	var root_instance := ""
	var root_script := ""
	for line in FileAccess.get_file_as_string(scene_path).split("\n"):
		if line.begins_with("[ext_resource "):
			var attributes := GodotMcpSymbolRenameInText.attributes_of(line)
			if attributes.get("type") == "Script":
				script_paths[attributes.get("id")] = attributes.get("path")
			elif attributes.get("type") == "PackedScene":
				scene_paths[attributes.get("id")] = attributes.get("path")
		elif line.begins_with("[node "):
			if in_root:
				break
			var attributes := GodotMcpSymbolRenameInText.attributes_of(line)
			in_root = not attributes.has("parent")
			root_instance = GodotMcpSymbolRenameInText.resource_id_in(str(attributes.get("instance", "")))
		elif in_root and line.begins_with("script = "):
			root_script = script_paths.get(GodotMcpSymbolRenameInText.resource_id_in(line), "")
	if root_script.is_empty() and scene_paths.has(root_instance):
		root_script = _root_script_of(scene_paths[root_instance], cache)
	cache[scene_path] = root_script
	return root_script
