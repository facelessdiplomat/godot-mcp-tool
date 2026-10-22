extends GutTest

const AssetImportSettingsGetCommand := preload("res://addons/godot_mcp_tool/commands/asset/asset_import_settings_get_command.gd")
const AssetImportSettingsSetCommand := preload("res://addons/godot_mcp_tool/commands/asset/asset_import_settings_set_command.gd")
const CommandError := preload("res://addons/godot_mcp_tool/commands/command_error.gd")
const FakeFileSystemAccess := preload("res://tests/support/fake_file_system_access.gd")
const JsonRpc := preload("res://addons/godot_mcp_tool/bridge/json_rpc.gd")
const ScratchFolder := preload("res://tests/support/scratch_folder.gd")
const VariantCodec := preload("res://addons/godot_mcp_tool/codec/variant_codec.gd")

const CHARACTER := "res://tests/fixtures/models/character.glb"

var _file_system: FakeFileSystemAccess
var _scratch_directory := ""


func before_each() -> void:
	_file_system = FakeFileSystemAccess.new()
	_scratch_directory = "res://.godot/mcp_test_scratch/%d" % Time.get_ticks_usec()
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(_scratch_directory))


func after_each() -> void:
	ScratchFolder.remove(ProjectSettings.globalize_path(_scratch_directory))


func _copied_character() -> String:
	var copy := _scratch_directory.path_join("character.glb")
	DirAccess.copy_absolute(ProjectSettings.globalize_path(CHARACTER), ProjectSettings.globalize_path(copy))
	DirAccess.copy_absolute(ProjectSettings.globalize_path(CHARACTER + ".import"), ProjectSettings.globalize_path(copy + ".import"))
	return copy


func _import_file(asset_path: String) -> ConfigFile:
	var file := ConfigFile.new()
	file.load(asset_path + ".import")
	return file


func _set_command() -> AssetImportSettingsSetCommand:
	return AssetImportSettingsSetCommand.new(VariantCodec.new(), _file_system)


func _rejected_names(result: Dictionary) -> Array:
	return (result["rejected"] as Array).map(func(rejection: Dictionary) -> String: return rejection["name"])


func _reason_for(result: Dictionary, name: String) -> String:
	for rejection in result["rejected"]:
		if rejection["name"] == name:
			return rejection["reason"]
	return ""


func test_reads_the_options_the_node_settings_and_the_imported_scene() -> void:
	var result: Dictionary = await AssetImportSettingsGetCommand.new(VariantCodec.new()).execute({"path": CHARACTER})
	assert_eq(result["path"], CHARACTER)
	assert_eq(result["importer"], "scene")
	assert_eq(result["type"], "PackedScene")
	assert_has(result["options"], {"name": "nodes/root_scale", "value": 1.0})
	assert_has(result["options"], {"name": "materials/extract", "value": "Keep Internal"})
	assert_eq(result["node_settings"], {})
	assert_eq((result["scene"] as Dictionary)["size"], "Vector3(50, 180, 50)")


func test_changes_options_and_node_settings_and_reimports() -> void:
	var copy := _copied_character()
	var result: Dictionary = await _set_command().execute({
		"path": copy,
		"options": {"nodes/root_scale": 0.01},
		"nodes": {"Body": {"generate/physics": true, "physics/shape_type": "Capsule", "primitive/height": 180}},
	})
	assert_eq(result["applied"], ["nodes/root_scale", "Body: generate/physics", "Body: physics/shape_type", "Body: primitive/height"])
	assert_eq(result["rejected"], [])
	assert_eq(_file_system.reimported, [PackedStringArray([copy])])
	assert_eq(_import_file(copy).get_value("params", "nodes/root_scale"), 0.01)
	assert_eq(
		_import_file(copy).get_value("params", "_subresources"),
		{"nodes": {"PATH:Body": {"generate/physics": true, "physics/shape_type": 6, "primitive/height": 180.0}}},
	)
	assert_eq((result["scene_before"] as Dictionary)["size"], "Vector3(50, 180, 50)")
	assert_true(result["scene"] is Dictionary)


func test_rejects_unknown_options_nodes_and_values_and_applies_the_rest() -> void:
	var copy := _copied_character()
	var result: Dictionary = await _set_command().execute({
		"path": copy,
		"options": {"nodes/root_scal": 0.01, "nodes/root_type": "Node3D"},
		"nodes": {"Bodyy": {"generate/physics": true}, "Body": {"physics/shape": 6, "physics/shape_type": "Hexagon"}},
	})
	assert_eq(result["applied"], ["nodes/root_type"])
	assert_eq(_rejected_names(result), ["nodes/root_scal", "Bodyy", "Body: physics/shape", "Body: physics/shape_type"])
	assert_string_contains(_reason_for(result, "nodes/root_scal"), "nodes/root_scale")
	assert_string_contains(_reason_for(result, "Bodyy"), "Body")
	assert_string_contains(_reason_for(result, "Body: physics/shape"), "physics/shape_type")
	assert_string_contains(_reason_for(result, "Body: physics/shape_type"), "\"Hexagon\"")
	assert_eq(_import_file(copy).get_value("params", "nodes/root_type"), "Node3D")


func test_changes_nothing_when_every_setting_is_rejected() -> void:
	var copy := _copied_character()
	var result: Dictionary = await _set_command().execute({"path": copy, "options": {"nodes/root_scale": "small"}})
	assert_eq(result["applied"], [])
	assert_eq(_rejected_names(result), ["nodes/root_scale"])
	assert_eq(_file_system.reimported, [])
	assert_eq(_import_file(copy).get_value("params", "nodes/root_scale"), 1.0)


func test_requires_a_change() -> void:
	var error: CommandError = await _set_command().execute({"path": CHARACTER})
	assert_eq(error.code, JsonRpc.INVALID_PARAMS)
	assert_string_contains(error.message, "options")
