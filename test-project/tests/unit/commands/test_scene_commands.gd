extends GutTest

const GodotMcpCommandError := preload("res://addons/godot_mcp_tool/commands/command_error.gd")
const GodotMcpEditingContext := preload("res://addons/godot_mcp_tool/scene/editing_context.gd")
const FakeSceneAccess := preload("res://tests/support/fake_scene_access.gd")
const FakeScriptEditorAccess := preload("res://tests/support/fake_script_editor_access.gd")
const GodotMcpJsonRpc := preload("res://addons/godot_mcp_tool/bridge/json_rpc.gd")
const GodotMcpPlainUndoHistory := preload("res://addons/godot_mcp_tool/scene/plain_undo_history.gd")
const GodotMcpSceneCloseCommand := preload("res://addons/godot_mcp_tool/commands/scene/scene_close_command.gd")
const GodotMcpSceneCreateCommand := preload("res://addons/godot_mcp_tool/commands/scene/scene_create_command.gd")
const GodotMcpSceneGetTreeCommand := preload("res://addons/godot_mcp_tool/commands/scene/scene_get_tree_command.gd")
const GodotMcpSceneOpenCommand := preload("res://addons/godot_mcp_tool/commands/scene/scene_open_command.gd")
const GodotMcpSceneSaveCommand := preload("res://addons/godot_mcp_tool/commands/scene/scene_save_command.gd")
const ScratchFolder := preload("res://tests/support/scratch_folder.gd")
const GodotMcpVariantCodec := preload("res://addons/godot_mcp_tool/codec/variant_codec.gd")

const CRATE_SCENE := "res://tests/fixtures/crate.tscn"
const MAIN_SCENE_SETTING := "application/run/main_scene"

var _scenes: FakeSceneAccess
var _scripts: FakeScriptEditorAccess
var _history: GodotMcpPlainUndoHistory
var _context: GodotMcpEditingContext
var _scratch_directory := ""
var _main_scene: Variant


func before_each() -> void:
	_scenes = FakeSceneAccess.new()
	_history = GodotMcpPlainUndoHistory.new()
	_scripts = FakeScriptEditorAccess.new()
	_context = GodotMcpEditingContext.new(_scenes, _history, GodotMcpVariantCodec.new(), _scripts)
	_scratch_directory = "res://.godot/mcp_test_scratch/%d" % Time.get_ticks_usec()
	_main_scene = ProjectSettings.get_setting(MAIN_SCENE_SETTING)


func after_each() -> void:
	ProjectSettings.set_setting(MAIN_SCENE_SETTING, _main_scene)
	_history.dispose()
	_scenes.release()
	ScratchFolder.remove(ProjectSettings.globalize_path(_scratch_directory))


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
	var result: Dictionary = await GodotMcpSceneGetTreeCommand.new(_context).execute({})
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
	var result: Dictionary = await GodotMcpSceneGetTreeCommand.new(_context).execute({"max_depth": 1})
	var player: Dictionary = result["root"]["children"][0]
	assert_false(player.has("children"))
	assert_eq(player["child_count"], 1)
	assert_true(result["truncated"])


func test_reads_a_scene_from_disk_without_opening_it() -> void:
	var result: Dictionary = await GodotMcpSceneGetTreeCommand.new(_context).execute({"scene": CRATE_SCENE})
	assert_eq(result["root"]["name"], "Crate")
	assert_eq((result["root"]["children"][0] as Dictionary)["type"], "MeshInstance3D")
	assert_eq(_scenes.opened_paths.size(), 0)


func test_reads_the_main_scene_by_the_name_main() -> void:
	ProjectSettings.set_setting(MAIN_SCENE_SETTING, CRATE_SCENE)
	var result: Dictionary = await GodotMcpSceneGetTreeCommand.new(_context).execute({"scene": "main"})
	assert_eq(result["scene"], CRATE_SCENE)
	assert_eq(result["root"]["name"], "Crate")


func test_opens_the_main_scene_by_the_name_main() -> void:
	ProjectSettings.set_setting(MAIN_SCENE_SETTING, CRATE_SCENE)
	var result: Dictionary = await GodotMcpSceneOpenCommand.new(_context).execute({"path": "main"})
	assert_eq(result["scene"], CRATE_SCENE)
	assert_eq(_scenes.opened_paths, PackedStringArray([CRATE_SCENE]))


func test_explains_main_in_a_project_without_a_main_scene() -> void:
	ProjectSettings.set_setting(MAIN_SCENE_SETTING, "")
	var error: Variant = await GodotMcpSceneGetTreeCommand.new(_context).execute({"scene": "main"})
	assert_eq((error as GodotMcpCommandError).message, "The project has no main scene")


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
	var result: Dictionary = await GodotMcpSceneGetTreeCommand.new(_context).execute({})
	var children: Array = result["root"]["children"]
	assert_eq((children[1] as Dictionary)["instance"], CRATE_SCENE)
	assert_false((children[1] as Dictionary).has("children"))
	assert_eq((children[2] as Dictionary)["script"], "res://tests/fixtures/patrol_point.gd")
	assert_eq((children[2] as Dictionary)["type"], "PatrolPoint")


func test_creates_a_scene_and_opens_it() -> void:
	var scene_path := _scratch_directory.path_join("level.tscn")
	var result: Dictionary = await GodotMcpSceneCreateCommand.new(_context).execute({"path": scene_path, "root_type": "Node3D", "root_name": "Level"})
	assert_eq(result["scene"], scene_path)
	assert_true(FileAccess.file_exists(scene_path))
	assert_eq(_scenes.opened_paths, PackedStringArray([scene_path]))
	assert_eq(_scenes.edited_root.name, &"Level")


func test_creates_an_inherited_scene_from_a_scene_path() -> void:
	var scene_path := _scratch_directory.path_join("big_crate.tscn")
	await GodotMcpSceneCreateCommand.new(_context).execute({"path": scene_path, "root_type": CRATE_SCENE, "root_name": "BigCrate"})
	var state := (load(scene_path) as PackedScene).get_state()
	assert_not_null(state.get_base_scene_state())


func test_refuses_to_overwrite_an_existing_scene() -> void:
	var error: Variant = await GodotMcpSceneCreateCommand.new(_context).execute({"path": CRATE_SCENE, "root_type": "Node3D"})
	assert_eq((error as GodotMcpCommandError).code, GodotMcpJsonRpc.INVALID_PARAMS)
	assert_string_contains((error as GodotMcpCommandError).hint, "scene_open")


func test_requires_a_project_scene_path() -> void:
	var error: Variant = await GodotMcpSceneCreateCommand.new(_context).execute({"path": "/tmp/level.tscn", "root_type": "Node3D"})
	assert_eq((error as GodotMcpCommandError).code, GodotMcpJsonRpc.INVALID_PARAMS)


func test_opens_a_scene() -> void:
	var result: Dictionary = await GodotMcpSceneOpenCommand.new(_context).execute({"path": CRATE_SCENE})
	assert_eq(result["scene"], CRATE_SCENE)
	assert_eq(_scenes.edited_root.name, &"Crate")


func test_reports_a_missing_scene_when_opening() -> void:
	var error: Variant = await GodotMcpSceneOpenCommand.new(_context).execute({"path": "res://missing.tscn"})
	assert_eq((error as GodotMcpCommandError).code, GodotMcpJsonRpc.NOT_FOUND)


func test_saves_the_edited_scene() -> void:
	_build_arena()
	var result: Dictionary = await GodotMcpSceneSaveCommand.new(_context).execute({})
	assert_eq(result["saved"], ["res://levels/arena.tscn"])
	assert_eq(result["scripts"], [])
	assert_eq(_scenes.saved_paths, PackedStringArray(["res://levels/arena.tscn"]))


func test_reports_the_saved_scene_when_the_editor_replaces_its_root_while_saving() -> void:
	_build_arena()
	_scenes.while_saving = _scenes.replace_edited_root
	var result: Dictionary = await GodotMcpSceneSaveCommand.new(_context).execute({})
	assert_eq(result["saved"], ["res://levels/arena.tscn"])
	assert_eq(_scenes.saved_paths, PackedStringArray(["res://levels/arena.tscn"]))


func test_saves_the_root_that_replaced_the_scene_while_scripts_were_prepared() -> void:
	_build_arena()
	_scripts.while_reloading = _scenes.replace_edited_root
	var result: Dictionary = await GodotMcpSceneSaveCommand.new(_context).execute({})
	assert_eq(result["saved"], ["res://levels/arena.tscn"])
	assert_eq(_scenes.saved_paths, PackedStringArray(["res://levels/arena.tscn"]))


func test_reports_a_scene_closed_while_scripts_were_prepared() -> void:
	_build_arena()
	_scripts.while_reloading = _scenes.release
	var error: Variant = await GodotMcpSceneSaveCommand.new(_context).execute({})
	assert_true(error is GodotMcpCommandError)
	assert_eq((error as GodotMcpCommandError).code, GodotMcpJsonRpc.NOT_FOUND)
	assert_string_contains((error as GodotMcpCommandError).message, "was closed")
	assert_eq(_scenes.saved_paths, PackedStringArray())


func test_reports_unsaved_scripts_that_the_save_writes() -> void:
	_build_arena()
	_scripts.unsaved = PackedStringArray(["res://player/player.gd"])
	var result: Dictionary = await GodotMcpSceneSaveCommand.new(_context).execute({})
	assert_eq(result["scripts"], ["res://player/player.gd"])


func test_refuses_to_save_over_a_script_changed_on_disk() -> void:
	_build_arena()
	_scripts.unsaved = PackedStringArray(["res://player/player.gd"])
	_scripts.changed_outside = PackedStringArray(["player.gd"])
	var error: Variant = await GodotMcpSceneSaveCommand.new(_context).execute({})
	assert_true(error is GodotMcpCommandError)
	assert_eq((error as GodotMcpCommandError).code, GodotMcpJsonRpc.CONFLICT)
	assert_eq(_scenes.saved_paths, PackedStringArray())


func test_closes_the_scene_open_in_the_editor() -> void:
	_build_arena()
	var result: Dictionary = await GodotMcpSceneCloseCommand.new(_context).execute({})
	assert_eq(_scenes.closed_paths, PackedStringArray(["res://levels/arena.tscn"]))
	assert_eq_deep(result, {"closed": "res://levels/arena.tscn", "saved": false, "discarded_changes": false, "current": ""})


func test_keeps_a_scene_with_unsaved_changes_open_unless_told_what_to_do() -> void:
	var root := _build_arena()
	_scenes.unsaved_roots.append(root)
	var refused: GodotMcpCommandError = await GodotMcpSceneCloseCommand.new(_context).execute({})
	assert_string_contains(refused.message, "unsaved changes")
	assert_string_contains(refused.hint, "\"save\"")
	assert_eq(_scenes.closed_paths.size(), 0)


func test_saves_unsaved_changes_before_closing_on_request() -> void:
	var root := _build_arena()
	_scenes.unsaved_roots.append(root)
	var result: Dictionary = await GodotMcpSceneCloseCommand.new(_context).execute({"unsaved": "save"})
	assert_eq(_scenes.saved_paths, PackedStringArray(["res://levels/arena.tscn"]))
	assert_eq(result["saved"], true)
	assert_eq(_scenes.closed_paths, PackedStringArray(["res://levels/arena.tscn"]))


func test_closes_the_root_that_replaced_the_scene_while_its_changes_were_saved() -> void:
	var root := _build_arena()
	_scenes.unsaved_roots.append(root)
	_scenes.while_saving = _scenes.replace_edited_root
	var result: Dictionary = await GodotMcpSceneCloseCommand.new(_context).execute({"unsaved": "save"})
	assert_eq(_scenes.saved_paths, PackedStringArray(["res://levels/arena.tscn"]))
	assert_eq(_scenes.closed_paths, PackedStringArray(["res://levels/arena.tscn"]))
	assert_eq(result["closed"], "res://levels/arena.tscn")
	assert_eq(result["saved"], true)


func test_reports_a_scene_closed_while_its_changes_were_saved_as_closed() -> void:
	var root := _build_arena()
	_scenes.unsaved_roots.append(root)
	_scenes.while_saving = _scenes.release
	var result: Dictionary = await GodotMcpSceneCloseCommand.new(_context).execute({"unsaved": "save"})
	assert_eq(_scenes.closed_paths, PackedStringArray())
	assert_eq_deep(result, {"closed": "res://levels/arena.tscn", "saved": true, "discarded_changes": false, "current": ""})


func test_discards_unsaved_changes_on_request() -> void:
	var root := _build_arena()
	_scenes.unsaved_roots.append(root)
	var result: Dictionary = await GodotMcpSceneCloseCommand.new(_context).execute({"unsaved": "discard"})
	assert_eq(_scenes.saved_paths.size(), 0)
	assert_eq(result["discarded_changes"], true)


func test_explains_a_scene_that_is_not_open() -> void:
	_build_arena()
	var result: GodotMcpCommandError = await GodotMcpSceneCloseCommand.new(_context).execute({"scene": "res://levels/other.tscn"})
	var wrong_choice: GodotMcpCommandError = await GodotMcpSceneCloseCommand.new(_context).execute({"unsaved": "keep"})
	assert_eq(result.code, GodotMcpJsonRpc.NOT_FOUND)
	assert_string_contains(result.hint, "res://levels/arena.tscn")
	assert_eq(wrong_choice.code, GodotMcpJsonRpc.INVALID_PARAMS)
