extends GutTest

const CommandError := preload("res://addons/godot_mcp_tool/commands/command_error.gd")
const EditingContext := preload("res://addons/godot_mcp_tool/scene/editing_context.gd")
const FakeFileSystemAccess := preload("res://tests/support/fake_file_system_access.gd")
const FakeFileTrash := preload("res://tests/support/fake_file_trash.gd")
const FakeSceneAccess := preload("res://tests/support/fake_scene_access.gd")
const FakeScriptEditorAccess := preload("res://tests/support/fake_script_editor_access.gd")
const FilesystemDeleteCommand := preload("res://addons/godot_mcp_tool/commands/file/filesystem_delete_command.gd")
const JsonRpc := preload("res://addons/godot_mcp_tool/bridge/json_rpc.gd")
const PlainUndoHistory := preload("res://addons/godot_mcp_tool/scene/plain_undo_history.gd")
const ScratchProject := preload("res://tests/support/scratch_project.gd")
const VariantCodec := preload("res://addons/godot_mcp_tool/codec/variant_codec.gd")

const MAIN_SCENE_SETTING := "application/run/main_scene"
const AUTOLOAD_SETTING := "autoload/McpTestCrate"

var _project: ScratchProject
var _scenes: FakeSceneAccess
var _history: PlainUndoHistory
var _context: EditingContext
var _file_system: FakeFileSystemAccess
var _trash: FakeFileTrash
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
	_trash = FakeFileTrash.new()
	_settings_saves = 0
	_main_scene = ProjectSettings.get_setting(MAIN_SCENE_SETTING)


func after_each() -> void:
	ProjectSettings.set_setting(MAIN_SCENE_SETTING, _main_scene)
	if ProjectSettings.has_setting(AUTOLOAD_SETTING):
		ProjectSettings.clear(AUTOLOAD_SETTING)
	_history.dispose()
	_scenes.release()
	_project.remove()


func _delete(paths: Array, force := false) -> Variant:
	var command := FilesystemDeleteCommand.new(_context, _file_system, _trash, func() -> Error:
		_settings_saves += 1
		return OK)
	return await command.execute({"paths": paths, "force": force})


func _global(relative_path: String) -> String:
	return ProjectSettings.globalize_path(_project.path(relative_path))


func test_moves_an_unused_file_and_its_companions_to_the_trash() -> void:
	_project.write_text("notes.gd", "extends Node\n")
	_project.write_text("notes.gd.uid", "%s\n" % ResourceUID.id_to_text(ResourceUID.create_id()))
	var result: Dictionary = await _delete([_project.path("notes.gd")])
	assert_eq(result["deleted"], [_project.path("notes.gd")])
	assert_eq(result["blocked"], false)
	assert_eq(_trash.trashed, PackedStringArray([_global("notes.gd"), _global("notes.gd.uid")]))
	assert_false(FileAccess.file_exists(_project.path("notes.gd")))
	assert_eq(_file_system.applied, 1)


func test_keeps_a_file_that_other_files_use_unless_forced() -> void:
	var refused: Dictionary = await _delete([_project.path("materials/ice.tres")])
	assert_eq(refused["blocked"], true)
	assert_eq(refused["deleted"], [])
	assert_eq((refused["used_by"] as Array).map(func(user: Dictionary) -> String: return user["path"]), [_project.path("crate.tscn")])
	assert_true(FileAccess.file_exists(_project.path("materials/ice.tres")))
	assert_eq(_trash.trashed, PackedStringArray())
	var forced: Dictionary = await _delete([_project.path("materials/ice.tres")], true)
	assert_eq(forced["deleted"], [_project.path("materials/ice.tres")])
	assert_eq((forced["used_by"] as Array).size(), 1)
	assert_false(FileAccess.file_exists(_project.path("materials/ice.tres")))


func test_keeps_a_file_that_only_code_names_unless_forced() -> void:
	_project.write_text("loot_table.json", "{}\n")
	_project.write_text("loot.gd", "extends Node\n\nconst TABLE := \"%s\"\n" % _project.path("loot_table.json"))
	var refused: Dictionary = await _delete([_project.path("loot_table.json")])
	assert_eq(refused["blocked"], true)
	assert_eq((refused["code"] as Array).map(func(mention: Dictionary) -> String: return mention["path"]), [_project.path("loot.gd")])
	assert_true(FileAccess.file_exists(_project.path("loot_table.json")))
	var forced: Dictionary = await _delete([_project.path("loot_table.json")], true)
	assert_eq(forced["deleted"], [_project.path("loot_table.json")])


func test_counts_code_that_names_a_file_by_its_uid_among_the_mentions() -> void:
	var ice_uid := _project.assign_uid("materials/ice.tres")
	_project.write_text("frost.gd", "extends Node\n\nconst FROST := preload(\"%s\")\n" % ice_uid)
	var refused: Dictionary = await _delete([_project.path("materials/ice.tres")])
	assert_eq((refused["code"] as Array).map(func(mention: Dictionary) -> String: return mention["path"]), [_project.path("crate.gd"), _project.path("frost.gd")])


func test_clears_the_project_settings_that_point_at_a_forced_file() -> void:
	ProjectSettings.set_setting(MAIN_SCENE_SETTING, _project.path("level.tscn"))
	var refused: Dictionary = await _delete([_project.path("level.tscn")])
	assert_eq(refused["blocked"], true)
	var forced: Dictionary = await _delete([_project.path("level.tscn")], true)
	assert_eq(forced["settings"], [{"name": MAIN_SCENE_SETTING, "value": ""}])
	assert_eq(ProjectSettings.get_setting(MAIN_SCENE_SETTING), "")
	assert_eq(_settings_saves, 1)


func test_never_deletes_the_script_of_an_autoload() -> void:
	ProjectSettings.set_setting(AUTOLOAD_SETTING, "*" + _project.path("crate.gd"))
	var refused: CommandError = await _delete([_project.path("crate.gd")], true)
	assert_eq(refused.code, JsonRpc.CONFLICT)
	assert_string_contains(refused.message, "McpTestCrate")
	assert_string_contains(refused.hint, "autoload_remove")
	assert_true(FileAccess.file_exists(_project.path("crate.gd")))


func test_closes_an_open_scene_before_deleting_it_and_keeps_one_with_unsaved_changes() -> void:
	var crate := (ResourceLoader.load(_project.path("crate.tscn"), "", ResourceLoader.CACHE_MODE_IGNORE) as PackedScene).instantiate(PackedScene.GEN_EDIT_STATE_MAIN)
	crate.scene_file_path = _project.path("crate.tscn")
	_scenes.edited_root = crate
	_scenes.unsaved_roots = [crate]
	var refused: CommandError = await _delete([_project.path("crate.tscn")], true)
	assert_eq(refused.code, JsonRpc.CONFLICT)
	assert_true(FileAccess.file_exists(_project.path("crate.tscn")))
	_scenes.unsaved_roots = []
	var result: Dictionary = await _delete([_project.path("crate.tscn")], true)
	assert_eq(_scenes.closed_paths, PackedStringArray([_project.path("crate.tscn")]))
	assert_eq(result["deleted"], [_project.path("crate.tscn")])


func test_moves_a_whole_folder_to_the_trash() -> void:
	var result: Dictionary = await _delete([_project.path("materials")], true)
	assert_eq(result["deleted"], [_project.path("materials/")])
	assert_eq(_trash.trashed, PackedStringArray([_global("materials")]))
	assert_false(DirAccess.dir_exists_absolute(_project.path("materials")))


func test_explains_what_it_needs() -> void:
	var missing: CommandError = await _delete([_project.path("lava.tres")])
	assert_eq(missing.code, JsonRpc.NOT_FOUND)
	var nothing: CommandError = await _delete([])
	assert_eq(nothing.code, JsonRpc.INVALID_PARAMS)
