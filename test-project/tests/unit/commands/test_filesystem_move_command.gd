extends GutTest

const CommandError := preload("res://addons/godot_mcp_tool/commands/command_error.gd")
const EditingContext := preload("res://addons/godot_mcp_tool/scene/editing_context.gd")
const FakeFileSystemAccess := preload("res://tests/support/fake_file_system_access.gd")
const FakeSceneAccess := preload("res://tests/support/fake_scene_access.gd")
const FakeScriptEditorAccess := preload("res://tests/support/fake_script_editor_access.gd")
const FilesystemMoveCommand := preload("res://addons/godot_mcp_tool/commands/file/filesystem_move_command.gd")
const JsonRpc := preload("res://addons/godot_mcp_tool/bridge/json_rpc.gd")
const PlainUndoHistory := preload("res://addons/godot_mcp_tool/scene/plain_undo_history.gd")
const ScratchProject := preload("res://tests/support/scratch_project.gd")
const VariantCodec := preload("res://addons/godot_mcp_tool/codec/variant_codec.gd")

const MAIN_SCENE_SETTING := "application/run/main_scene"

var _project: ScratchProject
var _scenes: FakeSceneAccess
var _history: PlainUndoHistory
var _context: EditingContext
var _file_system: FakeFileSystemAccess
var _settings_saves := 0
var _main_scene: Variant


func before_each() -> void:
	_project = ScratchProject.new()
	_project.build_crate_level()
	_scenes = FakeSceneAccess.new()
	_history = PlainUndoHistory.new()
	_context = EditingContext.new(_scenes, _history, VariantCodec.new(), FakeScriptEditorAccess.new())
	_file_system = FakeFileSystemAccess.new()
	_file_system.applies_scans_at_once = true
	_settings_saves = 0
	_main_scene = ProjectSettings.get_setting(MAIN_SCENE_SETTING)


func after_each() -> void:
	ProjectSettings.set_setting(MAIN_SCENE_SETTING, _main_scene)
	_history.dispose()
	_scenes.release()
	_project.remove()


func _move(from: String, to: String) -> Variant:
	var command := FilesystemMoveCommand.new(_context, _file_system, func() -> Error:
		_settings_saves += 1
		return OK)
	return await command.execute({"from": from, "to": to})


func _open_crate() -> Node:
	var crate := (ResourceLoader.load(_project.path("crate.tscn"), "", ResourceLoader.CACHE_MODE_IGNORE) as PackedScene).instantiate(PackedScene.GEN_EDIT_STATE_MAIN)
	crate.scene_file_path = _project.path("crate.tscn")
	_scenes.edited_root = crate
	return crate


func test_moves_a_file_and_updates_the_scenes_that_use_it() -> void:
	var result: Dictionary = await _move(_project.path("materials/ice.tres"), _project.path("surfaces/ice.tres"))
	assert_eq(result["from"], _project.path("materials/ice.tres"))
	assert_eq(result["to"], _project.path("surfaces/ice.tres"))
	assert_eq(result["moved"], 1)
	assert_eq(result["updated"], [_project.path("crate.tscn")])
	assert_eq(result["not_updated"], [])
	assert_eq((result["code"] as Array).map(func(mention: Dictionary) -> String: return mention["path"]), [_project.path("crate.gd")])
	assert_false(FileAccess.file_exists(_project.path("materials/ice.tres")))
	assert_true(FileAccess.file_exists(_project.path("surfaces/ice.tres")))
	assert_string_contains(_project.read_text("crate.tscn"), "path=\"%s\"" % _project.path("surfaces/ice.tres"))
	assert_false(_project.read_text("crate.tscn").contains(_project.path("materials/ice.tres")))
	assert_eq(_file_system.applied, 1)
	var crate := (ResourceLoader.load(_project.path("crate.tscn"), "", ResourceLoader.CACHE_MODE_IGNORE) as PackedScene).instantiate()
	assert_eq((crate.get_node("Mesh") as MeshInstance3D).material_override.resource_path, _project.path("surfaces/ice.tres"))
	crate.free()


func test_leaves_out_code_that_names_the_file_by_its_uid_because_it_keeps_working() -> void:
	var ice_uid := _project.assign_uid("materials/ice.tres")
	_project.write_text("frost.gd", "extends Node\n\nconst FROST := preload(\"%s\")\n" % ice_uid)
	var result: Dictionary = await _move(_project.path("materials/ice.tres"), _project.path("surfaces/ice.tres"))
	assert_eq((result["code"] as Array).map(func(mention: Dictionary) -> String: return mention["path"]), [_project.path("crate.gd")])


func test_tells_the_editor_the_old_and_new_path_of_every_moved_file() -> void:
	await _move(_project.path("materials"), _project.path("surfaces"))
	await _move(_project.path("crate.gd"), _project.path("scripts/crate.gd"))
	assert_eq(_file_system.updated_files, PackedStringArray([
		_project.path("materials/ice.tres"),
		_project.path("surfaces/ice.tres"),
		_project.path("crate.gd"),
		_project.path("scripts/crate.gd"),
	]))


func test_renames_a_file_when_only_the_case_of_its_name_changes() -> void:
	_project.write_text("Notes.gd", "extends Node\n")
	var result: Dictionary = await _move(_project.path("Notes.gd"), _project.path("notes.gd"))
	var files := Array(DirAccess.get_files_at(_project.root))
	assert_eq(result["to"], _project.path("notes.gd"))
	assert_has(files, "notes.gd")
	assert_does_not_have(files, "Notes.gd")


func test_moves_a_script_with_its_uid_file() -> void:
	_project.write_text("crate.gd.uid", "uid://bmcpcrate\n")
	var result: Dictionary = await _move(_project.path("crate.gd"), _project.path("scripts/crate.gd"))
	assert_true(FileAccess.file_exists(_project.path("scripts/crate.gd.uid")))
	assert_false(FileAccess.file_exists(_project.path("crate.gd.uid")))
	assert_eq(result["updated"], [_project.path("crate.tscn")])


func test_moves_a_folder_and_updates_references_to_the_files_in_it() -> void:
	var result: Dictionary = await _move(_project.path("materials"), _project.path("surfaces"))
	assert_eq(result["from"], _project.path("materials/"))
	assert_eq(result["to"], _project.path("surfaces/"))
	assert_eq(result["moved"], 1)
	assert_true(FileAccess.file_exists(_project.path("surfaces/ice.tres")))
	assert_false(DirAccess.dir_exists_absolute(_project.path("materials")))
	assert_eq(result["updated"], [_project.path("crate.tscn")])


func test_lists_code_inside_a_moved_folder_at_its_new_path() -> void:
	_project.write_text("materials/ice_tint.gd", "extends Node\n\nconst ICE := \"%s\"\n" % _project.path("materials/ice.tres"))
	var result: Dictionary = await _move(_project.path("materials"), _project.path("surfaces"))
	assert_eq((result["code"] as Array).map(func(mention: Dictionary) -> String: return mention["path"]), [_project.path("crate.gd"), _project.path("surfaces/ice_tint.gd")])


func test_updates_the_project_settings_that_point_at_the_file() -> void:
	ProjectSettings.set_setting(MAIN_SCENE_SETTING, _project.path("level.tscn"))
	var result: Dictionary = await _move(_project.path("level.tscn"), _project.path("levels/level.tscn"))
	assert_eq(ProjectSettings.get_setting(MAIN_SCENE_SETTING), _project.path("levels/level.tscn"))
	assert_eq(result["settings"], [{"name": MAIN_SCENE_SETTING, "value": _project.path("levels/level.tscn")}])
	assert_eq(_settings_saves, 1)


func test_points_an_open_scene_at_its_new_path_and_reloads_open_scenes_that_use_the_file() -> void:
	var crate := _open_crate()
	await _move(_project.path("materials/ice.tres"), _project.path("surfaces/ice.tres"))
	assert_eq(_scenes.reloaded_paths, PackedStringArray([_project.path("crate.tscn")]))
	await _move(_project.path("crate.tscn"), _project.path("props/crate.tscn"))
	assert_eq(crate.scene_file_path, _project.path("props/crate.tscn"))


func test_refuses_while_a_scene_it_changes_has_unsaved_changes() -> void:
	var crate := _open_crate()
	_scenes.unsaved_roots = [crate]
	var refused: CommandError = await _move(_project.path("materials/ice.tres"), _project.path("surfaces/ice.tres"))
	assert_eq(refused.code, JsonRpc.CONFLICT)
	assert_string_contains(refused.message, _project.path("crate.tscn"))
	assert_true(FileAccess.file_exists(_project.path("materials/ice.tres")))


func test_explains_moves_it_cannot_make() -> void:
	var missing: CommandError = await _move(_project.path("materials/lava.tres"), _project.path("surfaces/lava.tres"))
	assert_eq(missing.code, JsonRpc.NOT_FOUND)
	var taken: CommandError = await _move(_project.path("crate.gd"), _project.path("crate.tscn"))
	assert_eq(taken.code, JsonRpc.INVALID_PARAMS)
	var into_itself: CommandError = await _move(_project.path("materials"), _project.path("materials/old"))
	assert_eq(into_itself.code, JsonRpc.INVALID_PARAMS)
	var outside: CommandError = await _move(_project.path("crate.gd"), "res://../crate.gd")
	assert_eq(outside.code, JsonRpc.INVALID_PARAMS)
