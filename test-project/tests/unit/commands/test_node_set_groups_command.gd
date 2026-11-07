extends GutTest

const GodotMcpCommandError := preload("res://addons/godot_mcp_tool/commands/command_error.gd")
const GodotMcpEditingContext := preload("res://addons/godot_mcp_tool/scene/editing_context.gd")
const FakeSceneAccess := preload("res://tests/support/fake_scene_access.gd")
const FakeScriptEditorAccess := preload("res://tests/support/fake_script_editor_access.gd")
const GodotMcpJsonRpc := preload("res://addons/godot_mcp_tool/bridge/json_rpc.gd")
const GodotMcpNodeSetGroupsCommand := preload("res://addons/godot_mcp_tool/commands/node/node_set_groups_command.gd")
const GodotMcpPlainUndoHistory := preload("res://addons/godot_mcp_tool/scene/plain_undo_history.gd")
const GodotMcpVariantCodec := preload("res://addons/godot_mcp_tool/codec/variant_codec.gd")

var _scenes: FakeSceneAccess
var _history: GodotMcpPlainUndoHistory
var _context: GodotMcpEditingContext
var _root: Node3D
var _player: CharacterBody3D


func before_each() -> void:
	_scenes = FakeSceneAccess.new()
	_root = Node3D.new()
	_root.name = "Arena"
	_root.scene_file_path = "res://levels/arena.tscn"
	_scenes.edited_root = _root
	_player = CharacterBody3D.new()
	_player.name = "Player"
	_player.add_to_group("player", true)
	_root.add_child(_player)
	_player.owner = _root
	_history = GodotMcpPlainUndoHistory.new()
	_context = GodotMcpEditingContext.new(_scenes, _history, GodotMcpVariantCodec.new(), FakeScriptEditorAccess.new())


func after_each() -> void:
	_history.dispose()
	_scenes.release()


func _set_groups(params: Dictionary) -> Variant:
	return await GodotMcpNodeSetGroupsCommand.new(_context).execute(params)


func test_adds_and_removes_groups_as_one_undo_step() -> void:
	var result: Dictionary = await _set_groups({"path": "Player", "add": ["enemies", "damageable"], "remove": ["player"]})
	assert_eq(result["scene"], "res://levels/arena.tscn")
	assert_eq(result["path"], "Player")
	assert_eq(result["groups"], ["enemies", "damageable"])
	assert_eq(result["added"], ["enemies", "damageable"])
	assert_eq(result["removed"], ["player"])
	assert_eq(result["unchanged"], [])
	assert_eq(_history.last_action_name(), "MCP: Set groups of Player")
	assert_true(_history.undo())
	assert_true(_player.is_in_group("player"))
	assert_false(_player.is_in_group("enemies"))


func test_adds_groups_that_are_saved_with_the_scene() -> void:
	await _set_groups({"path": "Player", "add": ["enemies"]})
	var packed_scene := PackedScene.new()
	packed_scene.pack(_root)
	var copy := packed_scene.instantiate()
	assert_true(copy.get_node("Player").is_in_group("enemies"))
	copy.free()


func test_reports_groups_that_needed_no_change() -> void:
	var result: Dictionary = await _set_groups({"path": "Player", "add": ["player"], "remove": ["ghosts"]})
	assert_eq(result["added"], [])
	assert_eq(result["removed"], [])
	assert_eq(result["unchanged"], ["player", "ghosts"])
	assert_eq(_history.last_action_name(), "")


func test_needs_groups_with_visible_names() -> void:
	var nothing: GodotMcpCommandError = await _set_groups({"path": "Player"})
	var hidden: GodotMcpCommandError = await _set_groups({"path": "Player", "add": ["_internal"]})
	var empty: GodotMcpCommandError = await _set_groups({"path": "Player", "add": [" "]})
	assert_eq(nothing.code, GodotMcpJsonRpc.INVALID_PARAMS)
	assert_string_contains(hidden.message, "_internal")
	assert_eq(empty.code, GodotMcpJsonRpc.INVALID_PARAMS)
	assert_false(_player.is_in_group("_internal"))


func test_explains_a_missing_node() -> void:
	var result: GodotMcpCommandError = await _set_groups({"path": "Ghost", "add": ["enemies"]})
	assert_eq(result.code, GodotMcpJsonRpc.NOT_FOUND)
