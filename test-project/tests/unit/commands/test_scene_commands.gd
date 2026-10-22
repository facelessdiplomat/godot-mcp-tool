extends GutTest

const CommandError := preload("res://addons/godot_mcp_tool/commands/command_error.gd")
const EditingContext := preload("res://addons/godot_mcp_tool/scene/editing_context.gd")
const FakeSceneAccess := preload("res://tests/support/fake_scene_access.gd")
const FakeScriptEditorAccess := preload("res://tests/support/fake_script_editor_access.gd")
const JsonRpc := preload("res://addons/godot_mcp_tool/bridge/json_rpc.gd")
const PlainUndoHistory := preload("res://addons/godot_mcp_tool/scene/plain_undo_history.gd")
const SceneCreateCommand := preload("res://addons/godot_mcp_tool/commands/scene/scene_create_command.gd")
const SceneGetTreeCommand := preload("res://addons/godot_mcp_tool/commands/scene/scene_get_tree_command.gd")
const SceneOpenCommand := preload("res://addons/godot_mcp_tool/commands/scene/scene_open_command.gd")
const SceneSaveCommand := preload("res://addons/godot_mcp_tool/commands/scene/scene_save_command.gd")
const VariantCodec := preload("res://addons/godot_mcp_tool/codec/variant_codec.gd")

const CRATE_SCENE := "res://tests/fixtures/crate.tscn"

var _scenes: FakeSceneAccess
var _scripts: FakeScriptEditorAccess
var _history: PlainUndoHistory
var _context: EditingContext
var _scratch_directory := ""


func before_each() -> void:
	_scenes = FakeSceneAccess.new()
	_history = PlainUndoHistory.new()
	_scripts = FakeScriptEditorAccess.new()
	_context = EditingContext.new(_scenes, _history, VariantCodec.new(), _scripts)
	_scratch_directory = "res://.godot/mcp_test_scratch/%d" % Time.get_ticks_usec()


func after_each() -> void:
	_history.dispose()
	_scenes.release()
	_remove_directory_recursively(ProjectSettings.globalize_path(_scratch_directory))


func _remove_directory_recursively(directory_path: String) -> void:
	if not DirAccess.dir_exists_absolute(directory_path):
		return
	for subdirectory in DirAccess.get_directories_at(directory_path):
		_remove_directory_recursively(directory_path.path_join(subdirectory))
	for file_name in DirAccess.get_files_at(directory_path):
		DirAccess.remove_absolute(directory_path.path_join(file_name))
	DirAccess.remove_absolute(directory_path)


func _build_arena() -> Node3D:
	var root := Node3D.new()
	root.name = "Arena"
	root.scene_file_path = "res://levels/arena.tscn"
	var player := CharacterBody3D.new()
	player.name = "Player"
	player.add_to_group("player", true)
	root.add_child(player)
	player.owner = root
	var camera := Camera3D.new()
	camera.name = "Camera"
	player.add_child(camera)
	camera.owner = root
	_scenes.edited_root = root
	return root


func test_describes_the_tree_of_the_edited_scene() -> void:
	_build_arena()
	var result: Dictionary = await SceneGetTreeCommand.new(_context).execute({})
	var root: Dictionary = result["root"]
	assert_eq(result["scene"], "res://levels/arena.tscn")
	assert_eq(root["name"], "Arena")
	assert_eq(root["type"], "Node3D")
	var player: Dictionary = root["children"][0]
	assert_eq(player["name"], "Player")
	assert_eq(player["groups"], ["player"])
	assert_eq((player["children"][0] as Dictionary)["name"], "Camera")
	assert_eq(result["node_count"], 3)


func test_limits_the_depth_and_keeps_child_counts() -> void:
	_build_arena()
	var result: Dictionary = await SceneGetTreeCommand.new(_context).execute({"max_depth": 1})
	var player: Dictionary = result["root"]["children"][0]
	assert_false(player.has("children"))
	assert_eq(player["child_count"], 1)
	assert_true(result["truncated"])


func test_reads_a_scene_from_disk_without_opening_it() -> void:
	var result: Dictionary = await SceneGetTreeCommand.new(_context).execute({"scene": CRATE_SCENE})
	assert_eq(result["root"]["name"], "Crate")
	assert_eq((result["root"]["children"][0] as Dictionary)["type"], "MeshInstance3D")
	assert_eq(_scenes.opened_paths.size(), 0)


func test_marks_instanced_scenes_and_scripts() -> void:
	var root := _build_arena()
	var crate := (load(CRATE_SCENE) as PackedScene).instantiate(PackedScene.GEN_EDIT_STATE_INSTANCE)
	crate.name = "Crate"
	root.add_child(crate)
	crate.owner = root
	var marker := Marker3D.new()
	marker.name = "Patrol"
	marker.set_script(load("res://tests/fixtures/patrol_point.gd"))
	root.add_child(marker)
	marker.owner = root
	var result: Dictionary = await SceneGetTreeCommand.new(_context).execute({})
	var children: Array = result["root"]["children"]
	assert_eq((children[1] as Dictionary)["instance"], CRATE_SCENE)
	assert_false((children[1] as Dictionary).has("children"))
	assert_eq((children[2] as Dictionary)["script"], "res://tests/fixtures/patrol_point.gd")
	assert_eq((children[2] as Dictionary)["type"], "PatrolPoint")


func test_creates_a_scene_and_opens_it() -> void:
	var scene_path := _scratch_directory.path_join("level.tscn")
	var result: Dictionary = await SceneCreateCommand.new(_context).execute({"path": scene_path, "root_type": "Node3D", "root_name": "Level"})
	assert_eq(result["scene"], scene_path)
	assert_true(FileAccess.file_exists(scene_path))
	assert_eq(_scenes.opened_paths, PackedStringArray([scene_path]))
	assert_eq(_scenes.edited_root.name, &"Level")


func test_creates_an_inherited_scene_from_a_scene_path() -> void:
	var scene_path := _scratch_directory.path_join("big_crate.tscn")
	await SceneCreateCommand.new(_context).execute({"path": scene_path, "root_type": CRATE_SCENE, "root_name": "BigCrate"})
	var state := (load(scene_path) as PackedScene).get_state()
	assert_not_null(state.get_base_scene_state())


func test_refuses_to_overwrite_an_existing_scene() -> void:
	var error: Variant = await SceneCreateCommand.new(_context).execute({"path": CRATE_SCENE, "root_type": "Node3D"})
	assert_eq((error as CommandError).code, JsonRpc.INVALID_PARAMS)
	assert_string_contains((error as CommandError).hint, "scene_open")


func test_requires_a_project_scene_path() -> void:
	var error: Variant = await SceneCreateCommand.new(_context).execute({"path": "/tmp/level.tscn", "root_type": "Node3D"})
	assert_eq((error as CommandError).code, JsonRpc.INVALID_PARAMS)


func test_opens_a_scene() -> void:
	var result: Dictionary = await SceneOpenCommand.new(_context).execute({"path": CRATE_SCENE})
	assert_eq(result["scene"], CRATE_SCENE)
	assert_eq(_scenes.edited_root.name, &"Crate")


func test_reports_a_missing_scene_when_opening() -> void:
	var error: Variant = await SceneOpenCommand.new(_context).execute({"path": "res://missing.tscn"})
	assert_eq((error as CommandError).code, JsonRpc.NOT_FOUND)


func test_saves_the_edited_scene() -> void:
	_build_arena()
	var result: Dictionary = await SceneSaveCommand.new(_context).execute({})
	assert_eq(result["saved"], ["res://levels/arena.tscn"])
	assert_eq(result["scripts"], [])
	assert_eq(_scenes.saved_paths, PackedStringArray(["res://levels/arena.tscn"]))


func test_reports_unsaved_scripts_that_the_save_writes() -> void:
	_build_arena()
	_scripts.unsaved = PackedStringArray(["res://player/player.gd"])
	var result: Dictionary = await SceneSaveCommand.new(_context).execute({})
	assert_eq(result["scripts"], ["res://player/player.gd"])


func test_refuses_to_save_over_a_script_changed_on_disk() -> void:
	_build_arena()
	_scripts.unsaved = PackedStringArray(["res://player/player.gd"])
	_scripts.changed_outside = PackedStringArray(["player.gd"])
	var error: Variant = await SceneSaveCommand.new(_context).execute({})
	assert_true(error is CommandError)
	assert_eq((error as CommandError).code, JsonRpc.CONFLICT)
	assert_eq(_scenes.saved_paths, PackedStringArray())
