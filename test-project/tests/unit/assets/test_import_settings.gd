extends GutTest

const CommandError := preload("res://addons/godot_mcp_tool/commands/command_error.gd")
const ImportSettings := preload("res://addons/godot_mcp_tool/assets/import_settings.gd")
const JsonRpc := preload("res://addons/godot_mcp_tool/bridge/json_rpc.gd")
const ScratchFolder := preload("res://tests/support/scratch_folder.gd")

const CHARACTER := "res://tests/fixtures/models/character.glb"

var _scratch_directory := ""


func before_each() -> void:
	_scratch_directory = "res://.godot/mcp_test_scratch/%d" % Time.get_ticks_usec()
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(_scratch_directory))


func after_each() -> void:
	ScratchFolder.remove(ProjectSettings.globalize_path(_scratch_directory))


func _copied_character() -> String:
	var copy := _scratch_directory.path_join("character.glb")
	DirAccess.copy_absolute(ProjectSettings.globalize_path(CHARACTER), ProjectSettings.globalize_path(copy))
	DirAccess.copy_absolute(ProjectSettings.globalize_path(CHARACTER + ".import"), ProjectSettings.globalize_path(copy + ".import"))
	return copy


func _part_settings_on_disk(asset_path: String) -> Variant:
	var file := ConfigFile.new()
	file.load(asset_path + ".import")
	return file.get_value("params", "_subresources")


func test_reads_the_importer_and_the_options() -> void:
	var settings: ImportSettings = ImportSettings.open(CHARACTER)
	assert_eq(settings.importer(), "scene")
	assert_eq(settings.imported_type(), "PackedScene")
	assert_has(settings.option_names(), "nodes/root_scale")
	assert_does_not_have(settings.option_names(), "_subresources")
	assert_eq(settings.option("nodes/root_scale"), 1.0)
	assert_eq(settings.node_settings(), {})


func test_saves_options_and_node_settings() -> void:
	var copy := _copied_character()
	var settings: ImportSettings = ImportSettings.open(copy)
	settings.set_option("nodes/root_scale", 0.01)
	settings.set_node_option("Body", "generate/physics", true)
	assert_eq(settings.save(), OK)
	var saved: ImportSettings = ImportSettings.open(copy)
	assert_eq(saved.option("nodes/root_scale"), 0.01)
	assert_eq(saved.node_settings(), {"Body": {"generate/physics": true}})
	assert_eq(_part_settings_on_disk(copy), {"nodes": {"PATH:Body": {"generate/physics": true}}})


func test_keeps_the_settings_of_other_parts() -> void:
	var copy := _copied_character()
	var file := ConfigFile.new()
	file.load(copy + ".import")
	file.set_value("params", "_subresources", {"materials": {"Skin": {"use_external/enabled": true}}, "nodes": {"PATH:Body": {"generate/physics": true}}})
	file.save(copy + ".import")
	var settings: ImportSettings = ImportSettings.open(copy)
	settings.set_node_option("Body", "physics/shape_type", 6)
	settings.save()
	assert_eq(
		_part_settings_on_disk(copy),
		{"materials": {"Skin": {"use_external/enabled": true}}, "nodes": {"PATH:Body": {"generate/physics": true, "physics/shape_type": 6}}},
	)


func test_explains_files_that_are_not_imported() -> void:
	var scene: CommandError = ImportSettings.open("res://tests/fixtures/crate.tscn")
	assert_eq(scene.code, JsonRpc.INVALID_PARAMS)
	assert_eq(scene.message, "res://tests/fixtures/crate.tscn is not imported, so it has no import settings")
	var missing: CommandError = ImportSettings.open("res://models/missing.glb")
	assert_eq(missing.code, JsonRpc.NOT_FOUND)
	assert_eq(missing.message, "res://models/missing.glb not found")
	var outside: CommandError = ImportSettings.open("res://../outside.glb")
	assert_eq(outside.code, JsonRpc.INVALID_PARAMS)
