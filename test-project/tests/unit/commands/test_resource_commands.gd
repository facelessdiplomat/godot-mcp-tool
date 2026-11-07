extends GutTest

const GodotMcpCommandError := preload("res://addons/godot_mcp_tool/commands/command_error.gd")
const GodotMcpEditingContext := preload("res://addons/godot_mcp_tool/scene/editing_context.gd")
const FakeSceneAccess := preload("res://tests/support/fake_scene_access.gd")
const FakeScriptEditorAccess := preload("res://tests/support/fake_script_editor_access.gd")
const GodotMcpJsonRpc := preload("res://addons/godot_mcp_tool/bridge/json_rpc.gd")
const GodotMcpPlainUndoHistory := preload("res://addons/godot_mcp_tool/scene/plain_undo_history.gd")
const GodotMcpResourceCreateCommand := preload("res://addons/godot_mcp_tool/commands/resource/resource_create_command.gd")
const GodotMcpResourceGetCommand := preload("res://addons/godot_mcp_tool/commands/resource/resource_get_command.gd")
const GodotMcpResourceSetPropertiesCommand := preload("res://addons/godot_mcp_tool/commands/resource/resource_set_properties_command.gd")
const ScratchFolder := preload("res://tests/support/scratch_folder.gd")
const GodotMcpVariantCodec := preload("res://addons/godot_mcp_tool/codec/variant_codec.gd")

const ORANGE_MATERIAL := "res://tests/fixtures/orange_material.tres"
const CRATE_SCENE := "res://tests/fixtures/crate.tscn"
const PATROL_POINT_SCRIPT := "res://tests/fixtures/patrol_point.gd"

var _scenes: FakeSceneAccess
var _history: GodotMcpPlainUndoHistory
var _context: GodotMcpEditingContext
var _scratch_directory := ""


func before_each() -> void:
	_scenes = FakeSceneAccess.new()
	_history = GodotMcpPlainUndoHistory.new()
	_context = GodotMcpEditingContext.new(_scenes, _history, GodotMcpVariantCodec.new(), FakeScriptEditorAccess.new())
	_scratch_directory = "res://.godot/mcp_test_scratch/%d" % Time.get_ticks_usec()


func after_each() -> void:
	_history.dispose()
	_scenes.release()
	ScratchFolder.remove(ProjectSettings.globalize_path(_scratch_directory))


func _scratch_path(file_name: String) -> String:
	return _scratch_directory.path_join(file_name)


func _saved_physics_material(file_name: String) -> String:
	var resource_path := _scratch_path(file_name)
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(_scratch_directory))
	ResourceSaver.save(PhysicsMaterial.new(), resource_path)
	return resource_path


func _from_disk(resource_path: String) -> Resource:
	return ResourceLoader.load(resource_path, "", ResourceLoader.CACHE_MODE_IGNORE)


func test_creates_a_resource_file_with_its_properties() -> void:
	var ice_path := _scratch_path("materials/ice.tres")
	var result: Dictionary = await GodotMcpResourceCreateCommand.new(_context).execute({"path": ice_path, "type": "PhysicsMaterial", "properties": {"friction": 0.05, "rough": true}})
	assert_eq(result["path"], ice_path)
	assert_eq(result["type"], "PhysicsMaterial")
	assert_eq(result["applied"], ["friction", "rough"])
	var ice := _from_disk(ice_path) as PhysicsMaterial
	assert_almost_eq(ice.friction, 0.05, 0.0001)
	assert_true(ice.rough)


func test_creates_a_resource_of_a_project_class() -> void:
	var stats_path := _scratch_path("goblin_stats.tres")
	var result: Dictionary = await GodotMcpResourceCreateCommand.new(_context).execute({"path": stats_path, "type": "EnemyStats", "properties": {"health": 30}})
	var stats := _from_disk(stats_path)
	assert_eq(result["type"], "EnemyStats")
	assert_eq((stats.get_script() as Script).get_global_name(), &"EnemyStats")
	assert_eq(stats.get("health"), 30)


func test_creates_the_file_and_reports_properties_it_could_not_set() -> void:
	var ice_path := _scratch_path("ice.tres")
	var result: Dictionary = await GodotMcpResourceCreateCommand.new(_context).execute({"path": ice_path, "type": "PhysicsMaterial", "properties": {"frictoin": 0.05}})
	assert_true(FileAccess.file_exists(ice_path))
	assert_eq(result["applied"], [])
	assert_string_contains((result["rejected"][0] as Dictionary)["reason"], "Similar: friction")


func test_refuses_to_overwrite_an_existing_file() -> void:
	var result: Variant = await GodotMcpResourceCreateCommand.new(_context).execute({"path": ORANGE_MATERIAL, "type": "StandardMaterial3D"})
	assert_true(result is GodotMcpCommandError)
	assert_string_contains((result as GodotMcpCommandError).message, "already exists")
	assert_string_contains((result as GodotMcpCommandError).hint, "resource_set_properties")


func test_explains_types_it_cannot_create_as_resources() -> void:
	var command := GodotMcpResourceCreateCommand.new(_context)
	var resource_path := _scratch_path("thing.tres")
	var node_type: GodotMcpCommandError = await command.execute({"path": resource_path, "type": "Node3D"})
	var abstract_type: GodotMcpCommandError = await command.execute({"path": resource_path, "type": "Shape3D"})
	var misspelled_type: GodotMcpCommandError = await command.execute({"path": resource_path, "type": "PhysicsMaterail"})
	var scene_type: GodotMcpCommandError = await command.execute({"path": resource_path, "type": "PackedScene"})
	var script_type: GodotMcpCommandError = await command.execute({"path": resource_path, "type": "GDScript"})
	assert_string_contains(node_type.message, "Node3D is not a resource class")
	assert_string_contains(abstract_type.message, "Shape3D is abstract")
	assert_string_contains(abstract_type.hint, "BoxShape3D")
	assert_eq(misspelled_type.code, GodotMcpJsonRpc.NOT_FOUND)
	assert_string_contains(misspelled_type.hint, "PhysicsMaterial")
	assert_string_contains(scene_type.hint, "scene_create")
	assert_string_contains(script_type.hint, ".gd")
	assert_false(FileAccess.file_exists(resource_path))


func test_refuses_paths_that_are_not_resource_files_in_the_project() -> void:
	var command := GodotMcpResourceCreateCommand.new(_context)
	for wrong_path in ["res://ice.png", "user://ice.tres", "res://../ice.tres", "res://levels/arena.tscn::1"]:
		var result: Variant = await command.execute({"path": wrong_path, "type": "PhysicsMaterial"})
		assert_true(result is GodotMcpCommandError, wrong_path)
		assert_eq((result as GodotMcpCommandError).code, GodotMcpJsonRpc.INVALID_PARAMS, wrong_path)


func test_reads_the_type_and_changed_properties_of_a_resource() -> void:
	var result: Dictionary = await GodotMcpResourceGetCommand.new(_context).execute({"path": ORANGE_MATERIAL})
	assert_eq(result["path"], ORANGE_MATERIAL)
	assert_eq(result["type"], "StandardMaterial3D")
	assert_eq_deep(result["properties"], [{"name": "albedo_color", "type": "Color", "value": "Color(1, 0.5, 0, 1)"}])
	assert_eq(result["dependencies"], [])


func test_reads_named_properties_and_explains_unknown_names() -> void:
	var result: Dictionary = await GodotMcpResourceGetCommand.new(_context).execute({"path": ORANGE_MATERIAL, "names": ["metallic", "metalic"]})
	var properties: Array = result["properties"]
	assert_eq((properties[0] as Dictionary)["value"], 0.0)
	assert_string_contains((properties[1] as Dictionary)["error"], "Similar: metallic")


func test_lists_the_files_a_resource_depends_on() -> void:
	var layered_path := _scratch_path("layered.tres")
	await GodotMcpResourceCreateCommand.new(_context).execute({"path": layered_path, "type": "StandardMaterial3D", "properties": {"next_pass": ORANGE_MATERIAL}})
	var result: Dictionary = await GodotMcpResourceGetCommand.new(_context).execute({"path": layered_path})
	assert_eq(result["dependencies"], [ORANGE_MATERIAL])


func test_refuses_to_read_scenes_and_scripts_as_resources() -> void:
	var command := GodotMcpResourceGetCommand.new(_context)
	var scene: GodotMcpCommandError = await command.execute({"path": CRATE_SCENE})
	var script: GodotMcpCommandError = await command.execute({"path": PATROL_POINT_SCRIPT})
	assert_string_contains(scene.hint, "scene_get_tree")
	assert_string_contains(script.message, "is a script")


func test_explains_a_missing_resource() -> void:
	var result: GodotMcpCommandError = await GodotMcpResourceGetCommand.new(_context).execute({"path": "res://materials/missing.tres"})
	assert_eq(result.code, GodotMcpJsonRpc.NOT_FOUND)
	assert_string_contains(result.hint, "resource_create")


func test_changes_properties_as_one_undo_step_and_saves_the_file() -> void:
	var ice_path := _saved_physics_material("ice.tres")
	var result: Dictionary = await GodotMcpResourceSetPropertiesCommand.new(_context).execute({"path": ice_path, "properties": {"friction": 0.1, "bounce": 0.5}})
	assert_eq(result["path"], ice_path)
	assert_eq(result["type"], "PhysicsMaterial")
	assert_eq(result["applied"], ["friction", "bounce"])
	assert_almost_eq((_from_disk(ice_path) as PhysicsMaterial).friction, 0.1, 0.0001)
	assert_eq(_history.last_action_name(), "MCP: Set properties of ice.tres")
	_history.undo()
	assert_almost_eq((load(ice_path) as PhysicsMaterial).friction, 1.0, 0.0001)


func test_changes_a_resource_of_a_project_class() -> void:
	var stats_path := _scratch_path("stats.tres")
	await GodotMcpResourceCreateCommand.new(_context).execute({"path": stats_path, "type": "EnemyStats"})
	var result: Dictionary = await GodotMcpResourceSetPropertiesCommand.new(_context).execute({"path": stats_path, "properties": {"speed": 4.5}})
	assert_eq(result["applied"], ["speed"])
	assert_almost_eq(float(_from_disk(stats_path).get("speed")), 4.5, 0.0001)


func test_records_nothing_when_no_value_applies() -> void:
	var ice_path := _saved_physics_material("ice.tres")
	var result: Dictionary = await GodotMcpResourceSetPropertiesCommand.new(_context).execute({"path": ice_path, "properties": {"frictoin": 0.1}})
	assert_eq(result["applied"], [])
	assert_eq((result["rejected"] as Array).size(), 1)
	assert_eq(_history.last_action_name(), "")


func test_refuses_to_change_imported_files() -> void:
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(_scratch_directory))
	var image_path := _scratch_path("pixel.png")
	Image.create(1, 1, false, Image.FORMAT_RGBA8).save_png(image_path)
	FileAccess.open(image_path + ".import", FileAccess.WRITE).store_string("[remap]\n")
	var result: Variant = await GodotMcpResourceSetPropertiesCommand.new(_context).execute({"path": image_path, "properties": {"resource_name": "pixel"}})
	assert_true(result is GodotMcpCommandError)
	assert_string_contains((result as GodotMcpCommandError).message, "imported")


func test_requires_properties_to_set() -> void:
	var ice_path := _saved_physics_material("ice.tres")
	var result: Variant = await GodotMcpResourceSetPropertiesCommand.new(_context).execute({"path": ice_path, "properties": {}})
	assert_true(result is GodotMcpCommandError)
	assert_eq((result as GodotMcpCommandError).code, GodotMcpJsonRpc.INVALID_PARAMS)
