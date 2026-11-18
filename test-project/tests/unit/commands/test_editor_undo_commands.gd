extends GutTest

const GodotMcpChangeSet := preload("res://addons/godot_mcp_tool/scene/change_set.gd")
const GodotMcpCommandError := preload("res://addons/godot_mcp_tool/commands/command_error.gd")
const GodotMcpEditingContext := preload("res://addons/godot_mcp_tool/scene/editing_context.gd")
const GodotMcpEditorRedoCommand := preload("res://addons/godot_mcp_tool/commands/editor/editor_redo_command.gd")
const GodotMcpEditorUndoCommand := preload("res://addons/godot_mcp_tool/commands/editor/editor_undo_command.gd")
const GodotMcpPlainUndoHistory := preload("res://addons/godot_mcp_tool/scene/plain_undo_history.gd")
const GodotMcpVariantCodec := preload("res://addons/godot_mcp_tool/codec/variant_codec.gd")
const FakeSceneAccess := preload("res://tests/support/fake_scene_access.gd")
const FakeScriptEditorAccess := preload("res://tests/support/fake_script_editor_access.gd")

var _scenes: FakeSceneAccess
var _history: GodotMcpPlainUndoHistory
var _context: GodotMcpEditingContext
var _root: Node3D


func before_each() -> void:
	_scenes = FakeSceneAccess.new()
	_root = Node3D.new()
	_root.name = "Arena"
	_root.scene_file_path = "res://levels/arena.tscn"
	_scenes.edited_root = _root
	_history = GodotMcpPlainUndoHistory.new()
	_context = GodotMcpEditingContext.new(_scenes, _history, GodotMcpVariantCodec.new(), FakeScriptEditorAccess.new())


func after_each() -> void:
	_history.dispose()
	_scenes.release()


func _move(action_name: String, to: Vector3) -> void:
	var changes := GodotMcpChangeSet.new()
	changes.add_do_property(_root, &"position", to)
	changes.add_undo_property(_root, &"position", _root.position)
	_history.record(action_name, _root, [changes])


func _undo(params: Dictionary = {}) -> Variant:
	return await GodotMcpEditorUndoCommand.new(_context).execute(params)


func _redo(params: Dictionary = {}) -> Variant:
	return await GodotMcpEditorRedoCommand.new(_context).execute(params)


func test_undoes_the_last_actions_of_the_agent_and_names_them() -> void:
	_move("MCP: Set properties of Arena", Vector3(1, 0, 0))
	_move("MCP: Set properties of Arena", Vector3(2, 0, 0))
	var result: Dictionary = await _undo({"count": 2})
	assert_eq(result["scene"], "res://levels/arena.tscn")
	assert_eq(result["undone"], ["MCP: Set properties of Arena", "MCP: Set properties of Arena"])
	assert_eq(result["stopped"], "")
	assert_eq(result["next_undo"], "")
	assert_eq(result["next_redo"], "MCP: Set properties of Arena")
	assert_eq(_root.position, Vector3.ZERO)


func test_stops_at_an_action_of_the_user_unless_told_otherwise() -> void:
	_move("Move Node", Vector3(5, 0, 0))
	_move("MCP: Set properties of Arena", Vector3(6, 0, 0))
	var result: Dictionary = await _undo({"count": 3})
	assert_eq(result["undone"], ["MCP: Set properties of Arena"])
	assert_eq(result["stopped"], "user_action")
	assert_eq(result["next_undo"], "Move Node")
	assert_eq(_root.position, Vector3(5, 0, 0))
	var with_user: Dictionary = await _undo({"include_user_actions": true})
	assert_eq(with_user["undone"], ["Move Node"])
	assert_eq(_root.position, Vector3.ZERO)


func test_redoes_what_it_undid() -> void:
	_move("MCP: Set properties of Arena", Vector3(1, 0, 0))
	await _undo()
	var result: Dictionary = await _redo()
	assert_eq(result["redone"], ["MCP: Set properties of Arena"])
	assert_eq(result["stopped"], "")
	assert_eq(_root.position, Vector3(1, 0, 0))
	var nothing: Dictionary = await _redo()
	assert_eq(nothing["redone"], [])
	assert_eq(nothing["stopped"], "nothing_left")


func test_explains_a_count_it_cannot_use() -> void:
	var error: GodotMcpCommandError = await _undo({"count": 0})
	assert_string_contains(error.message, "count")
