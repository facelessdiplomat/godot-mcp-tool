extends RefCounted

const CommandError := preload("../commands/command_error.gd")
const JsonRpc := preload("../bridge/json_rpc.gd")

const IMPORT_SUFFIX := ".import"
const REMAP_SECTION := "remap"
const PARAMS_SECTION := "params"
const PART_SETTINGS_KEY := "_subresources"
const NODE_PART := "nodes"
const NODE_KEY_PREFIX := "PATH:"

var asset_path: String
var _file := ConfigFile.new()


static func open(path: String) -> Variant:
	var inside_project := path.begins_with("res://") and not ".." in path.trim_prefix("res://").split("/")
	if not inside_project or path.contains("::"):
		return CommandError.new(JsonRpc.INVALID_PARAMS, "\"%s\" is not a file in the project" % path, "Asset paths look like res://models/character.glb.")
	if not FileAccess.file_exists(path):
		return CommandError.new(JsonRpc.NOT_FOUND, "%s not found" % path, "Check the path, or let the editor import new files with editor_rescan.")
	if not FileAccess.file_exists(path + IMPORT_SUFFIX):
		return CommandError.new(
			JsonRpc.INVALID_PARAMS,
			"%s is not imported, so it has no import settings" % path,
			"Godot imports files such as .glb, .gltf, .fbx, .blend, .png and .wav; scenes and .tres resources are changed with the scene_, node_ and resource_ tools.",
		)
	var settings := new()
	settings.asset_path = path
	var load_error := settings._file.load(path + IMPORT_SUFFIX)
	if load_error != OK:
		return CommandError.new(JsonRpc.OPERATION_FAILED, "%s%s could not be read: %s" % [path, IMPORT_SUFFIX, error_string(load_error)])
	return settings


func importer() -> String:
	return str(_file.get_value(REMAP_SECTION, "importer", ""))


func imported_type() -> String:
	return str(_file.get_value(REMAP_SECTION, "type", ""))


func option_names() -> PackedStringArray:
	var names := PackedStringArray()
	if not _file.has_section(PARAMS_SECTION):
		return names
	for key in _file.get_section_keys(PARAMS_SECTION):
		if key != PART_SETTINGS_KEY:
			names.append(key)
	return names


func has_option(name: String) -> bool:
	return name != PART_SETTINGS_KEY and _file.has_section_key(PARAMS_SECTION, name)


func option(name: String) -> Variant:
	return _file.get_value(PARAMS_SECTION, name)


func set_option(name: String, value: Variant) -> void:
	_file.set_value(PARAMS_SECTION, name, value)


func node_settings() -> Dictionary:
	var settings := {}
	var nodes: Dictionary = _part_settings().get(NODE_PART, {})
	for key in nodes:
		settings[str(key).trim_prefix(NODE_KEY_PREFIX)] = (nodes[key] as Dictionary).duplicate()
	return settings


func set_node_option(node_path: String, name: String, value: Variant) -> void:
	var part_settings := _part_settings()
	var nodes: Dictionary = part_settings.get(NODE_PART, {})
	var key := NODE_KEY_PREFIX + node_path
	var node_options: Dictionary = nodes.get(key, {})
	node_options[name] = value
	nodes[key] = node_options
	part_settings[NODE_PART] = nodes
	_file.set_value(PARAMS_SECTION, PART_SETTINGS_KEY, part_settings)


func save() -> Error:
	return _file.save(asset_path + IMPORT_SUFFIX)


func _part_settings() -> Dictionary:
	var stored: Variant = _file.get_value(PARAMS_SECTION, PART_SETTINGS_KEY, {})
	return (stored as Dictionary).duplicate(true) if stored is Dictionary else {}
