extends GutTest

const GodotMcpCommandError := preload("res://addons/godot_mcp_tool/commands/command_error.gd")
const GodotMcpEditingContext := preload("res://addons/godot_mcp_tool/scene/editing_context.gd")
const GodotMcpEditorScreenshotCommand := preload("res://addons/godot_mcp_tool/commands/editor/editor_screenshot_command.gd")
const FakeSceneAccess := preload("res://tests/support/fake_scene_access.gd")
const FakeScriptEditorAccess := preload("res://tests/support/fake_script_editor_access.gd")
const GodotMcpJsonRpc := preload("res://addons/godot_mcp_tool/bridge/json_rpc.gd")
const GodotMcpPlainUndoHistory := preload("res://addons/godot_mcp_tool/scene/plain_undo_history.gd")
const GodotMcpPoseRequest := preload("res://addons/godot_mcp_tool/capture/pose_request.gd")
const GodotMcpVariantCodec := preload("res://addons/godot_mcp_tool/codec/variant_codec.gd")

var _scenes: FakeSceneAccess
var _history: GodotMcpPlainUndoHistory
var _context: GodotMcpEditingContext


func before_each() -> void:
	_scenes = FakeSceneAccess.new()
	var root := Node3D.new()
	root.name = "Arena"
	root.scene_file_path = "res://levels/arena.tscn"
	var player := Node3D.new()
	player.name = "Player"
	root.add_child(player)
	player.owner = root
	var animation_player := AnimationPlayer.new()
	animation_player.name = "AnimationPlayer"
	var library := AnimationLibrary.new()
	var walk := Animation.new()
	walk.length = 1.0
	library.add_animation("walk", walk)
	animation_player.add_animation_library("", library)
	root.add_child(animation_player)
	animation_player.owner = root
	_scenes.edited_root = root
	_history = GodotMcpPlainUndoHistory.new()
	_context = GodotMcpEditingContext.new(_scenes, _history, GodotMcpVariantCodec.new(), FakeScriptEditorAccess.new())


func after_each() -> void:
	_history.dispose()
	_scenes.release()


func _screenshot(params: Dictionary) -> Variant:
	return await GodotMcpEditorScreenshotCommand.new(_context, null, "user://captures").execute(params)


func test_refuses_screenshots_without_a_window() -> void:
	var error: Variant = await _screenshot({})
	assert_true(error is GodotMcpCommandError)
	assert_eq((error as GodotMcpCommandError).code, GodotMcpJsonRpc.OPERATION_FAILED)
	assert_string_contains((error as GodotMcpCommandError).message, "without a window")


func test_checks_the_views_before_rendering() -> void:
	var error: Variant = await _screenshot({"views": [{"preset": "front", "target": "Playr"}]})
	assert_true(error is GodotMcpCommandError)
	assert_eq((error as GodotMcpCommandError).code, GodotMcpJsonRpc.NOT_FOUND)
	assert_string_contains((error as GodotMcpCommandError).hint, "Player")


func test_needs_an_open_scene() -> void:
	_scenes.release()
	var error: Variant = await _screenshot({})
	assert_eq((error as GodotMcpCommandError).code, GodotMcpJsonRpc.NO_SCENE)


func test_checks_the_sizes_of_a_ui_scene_before_rendering() -> void:
	_scenes.release()
	var hud := Control.new()
	hud.name = "Hud"
	_scenes.edited_root = hud
	var with_views: GodotMcpCommandError = await _screenshot({"views": ["front"]})
	assert_eq(with_views.code, GodotMcpJsonRpc.INVALID_PARAMS)
	assert_string_contains(with_views.message, "sizes")
	var bad_size: GodotMcpCommandError = await _screenshot({"sizes": [[0, 10]]})
	assert_eq(bad_size.code, GodotMcpJsonRpc.INVALID_PARAMS)
	var fine: GodotMcpCommandError = await _screenshot({"sizes": [[1920, 1080], [1440, 1080]]})
	assert_string_contains(fine.message, "without a window")


func test_keeps_sizes_for_ui_and_2d_scenes() -> void:
	var error: GodotMcpCommandError = await _screenshot({"sizes": [[1920, 1080]]})
	assert_eq(error.code, GodotMcpJsonRpc.INVALID_PARAMS)
	assert_string_contains(error.message, "UI and 2D scenes")


func test_checks_the_animation_to_pose_before_rendering() -> void:
	var missing_player: GodotMcpCommandError = await _screenshot({"animation": {"player": "AnimationPlayr", "name": "walk"}})
	assert_eq(missing_player.code, GodotMcpJsonRpc.NOT_FOUND)
	assert_string_contains(missing_player.hint, "AnimationPlayer")
	var missing_animation: GodotMcpCommandError = await _screenshot({"animation": {"player": "AnimationPlayer", "name": "wlk"}})
	assert_eq(missing_animation.code, GodotMcpJsonRpc.NOT_FOUND)
	assert_eq(missing_animation.message, "AnimationPlayer has no animation \"wlk\"")
	assert_string_contains(missing_animation.hint, "walk")
	var too_late: GodotMcpCommandError = await _screenshot({"animation": {"player": "AnimationPlayer", "name": "walk", "times": [0.5, 2]}})
	assert_eq(too_late.code, GodotMcpJsonRpc.INVALID_PARAMS)
	assert_string_contains(too_late.message, "after the end")
	var many_views: GodotMcpCommandError = await _screenshot({"animation": {"player": "AnimationPlayer", "name": "walk"}, "views": ["front", "top"]})
	assert_eq(many_views.code, GodotMcpJsonRpc.INVALID_PARAMS)
	assert_string_contains(many_views.message, "one view")
	var fine: GodotMcpCommandError = await _screenshot({"animation": {"player": "AnimationPlayer", "name": "walk", "times": [0, 0.5]}, "views": ["front"]})
	assert_string_contains(fine.message, "without a window")


func test_spreads_the_poses_over_the_animation_by_default() -> void:
	assert_eq(GodotMcpPoseRequest.default_times(1.0, false), [0.0, 1.0 / 3.0, 2.0 / 3.0, 1.0])
	assert_eq(GodotMcpPoseRequest.default_times(1.0, true), [0.0, 0.25, 0.5, 0.75])
