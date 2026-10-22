extends GutTest

const CommandError := preload("res://addons/godot_mcp_tool/commands/command_error.gd")
const EditingContext := preload("res://addons/godot_mcp_tool/scene/editing_context.gd")
const EditorScreenshotCommand := preload("res://addons/godot_mcp_tool/commands/editor/editor_screenshot_command.gd")
const FakeSceneAccess := preload("res://tests/support/fake_scene_access.gd")
const FakeScriptEditorAccess := preload("res://tests/support/fake_script_editor_access.gd")
const JsonRpc := preload("res://addons/godot_mcp_tool/bridge/json_rpc.gd")
const PlainUndoHistory := preload("res://addons/godot_mcp_tool/scene/plain_undo_history.gd")
const VariantCodec := preload("res://addons/godot_mcp_tool/codec/variant_codec.gd")

var _scenes: FakeSceneAccess
var _history: PlainUndoHistory
var _context: EditingContext


func before_each() -> void:
	_scenes = FakeSceneAccess.new()
	var root := Node3D.new()
	root.name = "Arena"
	root.scene_file_path = "res://levels/arena.tscn"
	var player := Node3D.new()
	player.name = "Player"
	root.add_child(player)
	player.owner = root
	_scenes.edited_root = root
	_history = PlainUndoHistory.new()
	_context = EditingContext.new(_scenes, _history, VariantCodec.new(), FakeScriptEditorAccess.new())


func after_each() -> void:
	_history.dispose()
	_scenes.release()


func _screenshot(params: Dictionary) -> Variant:
	return await EditorScreenshotCommand.new(_context, null, "user://captures").execute(params)


func test_refuses_screenshots_without_a_window() -> void:
	var error: Variant = await _screenshot({})
	assert_true(error is CommandError)
	assert_eq((error as CommandError).code, JsonRpc.OPERATION_FAILED)
	assert_string_contains((error as CommandError).message, "without a window")


func test_checks_the_views_before_rendering() -> void:
	var error: Variant = await _screenshot({"views": [{"preset": "front", "target": "Playr"}]})
	assert_true(error is CommandError)
	assert_eq((error as CommandError).code, JsonRpc.NOT_FOUND)
	assert_string_contains((error as CommandError).hint, "Player")


func test_needs_an_open_scene() -> void:
	_scenes.release()
	var error: Variant = await _screenshot({})
	assert_eq((error as CommandError).code, JsonRpc.NO_SCENE)


func test_explains_a_scene_that_is_not_3d() -> void:
	_scenes.release()
	var hud := Control.new()
	hud.name = "Hud"
	_scenes.edited_root = hud
	var error: Variant = await _screenshot({})
	assert_true(error is CommandError)
	assert_string_contains((error as CommandError).message, "not a 3D scene")
	assert_string_contains((error as CommandError).hint, "game_screenshot")
