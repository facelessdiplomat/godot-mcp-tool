extends GutTest

const CommandError := preload("res://addons/godot_mcp_tool/commands/command_error.gd")
const EditingContext := preload("res://addons/godot_mcp_tool/scene/editing_context.gd")
const FakeSceneAccess := preload("res://tests/support/fake_scene_access.gd")
const FakeScriptEditorAccess := preload("res://tests/support/fake_script_editor_access.gd")
const JsonRpc := preload("res://addons/godot_mcp_tool/bridge/json_rpc.gd")
const PlainUndoHistory := preload("res://addons/godot_mcp_tool/scene/plain_undo_history.gd")
const SceneBatchEditCommand := preload("res://addons/godot_mcp_tool/commands/scene/scene_batch_edit_command.gd")
const VariantCodec := preload("res://addons/godot_mcp_tool/codec/variant_codec.gd")

const ARENA_SCRIPT := """extends Node3D


func _on_start_pressed() -> void:
	pass
"""

var _scenes: FakeSceneAccess
var _history: PlainUndoHistory
var _context: EditingContext
var _root: Node3D


func before_each() -> void:
	_scenes = FakeSceneAccess.new()
	var script := GDScript.new()
	script.source_code = ARENA_SCRIPT
	script.reload()
	_root = Node3D.new()
	_root.set_script(script)
	_root.name = "Arena"
	_root.scene_file_path = "res://levels/arena.tscn"
	_scenes.edited_root = _root
	add_child(_root)
	_history = PlainUndoHistory.new()
	_context = EditingContext.new(_scenes, _history, VariantCodec.new(), FakeScriptEditorAccess.new())


func after_each() -> void:
	_history.dispose()
	_scenes.release()


func _add_owned(parent: Node, node: Node, node_name: String) -> Node:
	node.name = node_name
	parent.add_child(node)
	node.owner = _root
	return node


func _batch(operations: Array) -> Variant:
	return await SceneBatchEditCommand.new(_context).execute({"operations": operations})


func test_applies_operations_that_build_on_each_other_as_one_undo_step() -> void:
	var result: Dictionary = await _batch([
		{"op": "node_add", "type": "CharacterBody3D", "name": "Player"},
		{"op": "node_add", "type": "Camera3D", "name": "Camera", "parent": "Player", "properties": {"position": [0, 2, 4]}},
		{"op": "node_set_properties", "path": "Player", "properties": {"position": [1, 0, 0]}},
		{"op": "node_reparent", "path": "Player/Camera", "name": "View"},
	])
	assert_eq(result["scene"], "res://levels/arena.tscn")
	assert_eq((result["results"] as Array).map(func(entry: Dictionary) -> String: return entry["op"]), ["node_add", "node_add", "node_set_properties", "node_reparent"])
	assert_not_null(_root.get_node_or_null("Player/View"))
	assert_eq(_history.last_action_name(), "MCP: Edit Arena (4 operations)")
	assert_true(_history.undo())
	assert_null(_root.get_node_or_null("Player"))
	assert_true(_history.redo())
	assert_eq((_root.get_node("Player") as Node3D).position, Vector3(1, 0, 0))
	assert_eq((_root.get_node("Player/View") as Node3D).position, Vector3(0, 2, 4))
	assert_eq(_root.get_node("Player/View").owner, _root)


func test_changes_nothing_when_an_operation_fails() -> void:
	_add_owned(_root, Node3D.new(), "Crate")
	var error: Variant = await _batch([
		{"op": "node_add", "type": "CharacterBody3D", "name": "Player"},
		{"op": "node_delete", "paths": ["Crate"]},
		{"op": "node_set_properties", "path": "Ghost", "properties": {"visible": false}},
	])
	assert_true(error is CommandError)
	assert_eq((error as CommandError).code, JsonRpc.NOT_FOUND)
	assert_string_contains((error as CommandError).message, "Operation 3 (node_set_properties)")
	assert_string_contains((error as CommandError).message, "Nothing was changed")
	assert_null(_root.get_node_or_null("Player"))
	assert_not_null(_root.get_node_or_null("Crate"))
	assert_eq(_root.get_node("Crate").owner, _root)
	assert_false(_history.undo())


func test_fails_when_a_property_is_rejected() -> void:
	var error: Variant = await _batch([{"op": "node_add", "type": "CharacterBody3D", "name": "Player", "properties": {"speed": 5}}])
	assert_true(error is CommandError)
	assert_string_contains((error as CommandError).message, "speed")
	assert_null(_root.get_node_or_null("Player"))


func test_connects_signals_of_nodes_added_in_the_same_batch() -> void:
	await _batch([
		{"op": "node_add", "type": "Button", "name": "Start"},
		{"op": "signal_connect", "from": "Start", "signal": "pressed", "method": "_on_start_pressed"},
	])
	var start := _root.get_node("Start") as Button
	assert_true(start.is_connected("pressed", Callable(_root, "_on_start_pressed")))
	assert_true(_history.undo())
	assert_null(_root.get_node_or_null("Start"))


func test_duplicates_and_deletes_in_one_step() -> void:
	_add_owned(_root, Node3D.new(), "Crate")
	await _batch([
		{"op": "node_duplicate", "path": "Crate", "name": "CrateB", "properties": {"position": [2, 0, 0]}},
		{"op": "node_delete", "paths": ["Crate"]},
	])
	assert_null(_root.get_node_or_null("Crate"))
	assert_eq((_root.get_node("CrateB") as Node3D).position, Vector3(2, 0, 0))
	assert_true(_history.undo())
	assert_not_null(_root.get_node_or_null("Crate"))
	assert_null(_root.get_node_or_null("CrateB"))


func test_explains_an_unknown_operation() -> void:
	var error: Variant = await _batch([{"op": "node_fly"}])
	assert_true(error is CommandError)
	assert_string_contains((error as CommandError).message, "Operation 1")
	assert_string_contains((error as CommandError).hint, "node_add")


func test_refuses_an_operation_with_a_scene_of_its_own() -> void:
	var error: Variant = await _batch([{"op": "node_add", "type": "Node3D", "scene": "res://other.tscn"}])
	assert_eq((error as CommandError).code, JsonRpc.INVALID_PARAMS)


func test_needs_operations() -> void:
	var error: Variant = await _batch([])
	assert_eq((error as CommandError).code, JsonRpc.INVALID_PARAMS)
