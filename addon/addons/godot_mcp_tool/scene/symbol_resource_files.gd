extends RefCounted

const GodotMcpSymbolUsesInText := preload("symbol_uses_in_text.gd")

const RESOURCE_EXTENSIONS := ["tscn", "tres"]
const SKIPPED_FOLDERS := ["res://addons", "res://.godot"]

var _root_scripts := {}


static func resource_files(directory: String) -> PackedStringArray:
	var found := PackedStringArray()
	if directory in SKIPPED_FOLDERS:
		return found
	for file_name in DirAccess.get_files_at(directory):
		if file_name.get_extension() in RESOURCE_EXTENSIONS:
			found.append(directory.path_join(file_name))
	for folder in DirAccess.get_directories_at(directory):
		if not folder.begins_with("."):
			found.append_array(resource_files(directory.path_join(folder)))
	return found


func root_script_of(scene_path: String) -> String:
	if _root_scripts.has(scene_path):
		return _root_scripts[scene_path]
	_root_scripts[scene_path] = ""
	var script_paths := {}
	var scene_paths := {}
	var in_root := false
	var root_instance := ""
	var root_script := ""
	for line in FileAccess.get_file_as_string(scene_path).split("\n"):
		if line.begins_with("[ext_resource "):
			var attributes := GodotMcpSymbolUsesInText.attributes_of(line)
			if attributes.get("type") == "Script":
				script_paths[attributes.get("id")] = attributes.get("path")
			elif attributes.get("type") == "PackedScene":
				scene_paths[attributes.get("id")] = attributes.get("path")
		elif line.begins_with("[node "):
			if in_root:
				break
			var attributes := GodotMcpSymbolUsesInText.attributes_of(line)
			in_root = not attributes.has("parent")
			root_instance = GodotMcpSymbolUsesInText.resource_id_in(str(attributes.get("instance", "")))
		elif in_root and line.begins_with("script = "):
			root_script = script_paths.get(GodotMcpSymbolUsesInText.resource_id_in(line), "")
	if root_script.is_empty() and scene_paths.has(root_instance):
		root_script = root_script_of(scene_paths[root_instance])
	_root_scripts[scene_path] = root_script
	return root_script
