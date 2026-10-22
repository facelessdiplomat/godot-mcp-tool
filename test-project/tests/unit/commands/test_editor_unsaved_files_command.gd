extends GutTest

const EditingContext := preload("res://addons/godot_mcp_tool/scene/editing_context.gd")
const EditorUnsavedFilesCommand := preload("res://addons/godot_mcp_tool/commands/editor/editor_unsaved_files_command.gd")
const FakeSceneAccess := preload("res://tests/support/fake_scene_access.gd")
const FakeScriptEditorAccess := preload("res://tests/support/fake_script_editor_access.gd")
const PlainUndoHistory := preload("res://addons/godot_mcp_tool/scene/plain_undo_history.gd")
const VariantCodec := preload("res://addons/godot_mcp_tool/codec/variant_codec.gd")

var _scenes: FakeSceneAccess
var _scripts: FakeScriptEditorAccess
var _history: PlainUndoHistory
var _context: EditingContext


func before_each() -> void:
	_scenes = FakeSceneAccess.new()
	_scripts = FakeScriptEditorAccess.new()
	_history = PlainUndoHistory.new()
	_context = EditingContext.new(_scenes, _history, VariantCodec.new(), _scripts)


func after_each() -> void:
	_history.dispose()
	_scenes.release()


func _unsaved_files() -> Dictionary:
	return await EditorUnsavedFilesCommand.new(_context, _scripts).execute({})


func test_lists_the_open_scenes_and_scripts_with_unsaved_changes() -> void:
	var level := Node3D.new()
	level.scene_file_path = "res://level.tscn"
	_scenes.edited_root = level
	_scenes.unsaved_roots = [level]
	_scripts.unsaved = PackedStringArray(["res://player.gd", "res://level.tscn::GDScript_k3x1a"])
	var unsaved := await _unsaved_files()
	assert_eq(unsaved["scenes"], PackedStringArray(["res://level.tscn"]))
	assert_eq(unsaved["scripts"], PackedStringArray(["res://player.gd"]))


func test_reports_nothing_when_every_open_file_is_saved() -> void:
	var level := Node3D.new()
	level.scene_file_path = "res://level.tscn"
	_scenes.edited_root = level
	var unsaved := await _unsaved_files()
	assert_eq(unsaved["scenes"], PackedStringArray())
	assert_eq(unsaved["scripts"], PackedStringArray())


func test_leaves_out_a_new_scene_that_was_never_saved_to_a_file() -> void:
	var untitled := Node3D.new()
	_scenes.edited_root = untitled
	_scenes.unsaved_roots = [untitled]
	var unsaved := await _unsaved_files()
	assert_eq(unsaved["scenes"], PackedStringArray())
