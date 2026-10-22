extends GutTest

const CommandError := preload("res://addons/godot_mcp_tool/commands/command_error.gd")
const EditingContext := preload("res://addons/godot_mcp_tool/scene/editing_context.gd")
const FakeSceneAccess := preload("res://tests/support/fake_scene_access.gd")
const FakeScriptEditorAccess := preload("res://tests/support/fake_script_editor_access.gd")
const JsonRpc := preload("res://addons/godot_mcp_tool/bridge/json_rpc.gd")
const PlainUndoHistory := preload("res://addons/godot_mcp_tool/scene/plain_undo_history.gd")
const SignalConnectCommand := preload("res://addons/godot_mcp_tool/commands/signal/signal_connect_command.gd")
const SignalDisconnectCommand := preload("res://addons/godot_mcp_tool/commands/signal/signal_disconnect_command.gd")
const SignalListCommand := preload("res://addons/godot_mcp_tool/commands/signal/signal_list_command.gd")
const VariantCodec := preload("res://addons/godot_mcp_tool/codec/variant_codec.gd")

const MAIN_SCRIPT := """extends Node3D


func _on_button_pressed() -> void:
	pass


func _on_body_entered(body: Node3D) -> void:
	pass


func _on_item_picked(item: String) -> void:
	pass
"""

var _scenes: FakeSceneAccess
var _history: PlainUndoHistory
var _context: EditingContext
var _root: Node3D
var _button: Button
var _area: Area3D


func before_each() -> void:
	_scenes = FakeSceneAccess.new()
	var script := GDScript.new()
	script.source_code = MAIN_SCRIPT
	script.reload()
	_root = Node3D.new()
	_root.set_script(script)
	_root.name = "Main"
	_root.scene_file_path = "res://main.tscn"
	_scenes.edited_root = _root
	_history = PlainUndoHistory.new()
	_context = EditingContext.new(_scenes, _history, VariantCodec.new(), FakeScriptEditorAccess.new())
	_button = _add_owned(_root, Button.new(), "Button") as Button
	_area = _add_owned(_root, Area3D.new(), "Area") as Area3D


func after_each() -> void:
	_history.dispose()
	_scenes.release()


func _add_owned(parent: Node, node: Node, node_name: String) -> Node:
	node.name = node_name
	parent.add_child(node)
	node.owner = _root
	return node


func _connect(params: Dictionary) -> Variant:
	return await SignalConnectCommand.new(_context).execute(params)


func test_connects_a_signal_persistently_and_undo_disconnects_it() -> void:
	var result: Dictionary = await _connect({"from": "Button", "signal": "pressed", "method": "_on_button_pressed"})
	assert_eq(result["from"], "Button")
	assert_eq(result["to"], ".")
	assert_eq(result["flags"], [])
	assert_false(result["already_connected"])
	var connections := _button.get_signal_connection_list("pressed")
	assert_eq(connections.size(), 1)
	assert_true(int(connections[0]["flags"]) & CONNECT_PERSIST != 0)
	assert_eq(_history.last_action_name(), "MCP: Connect Button.pressed to Main._on_button_pressed")
	assert_true(_history.undo())
	assert_false(_button.is_connected("pressed", Callable(_root, "_on_button_pressed")))


func test_suggests_a_signal_that_the_node_has() -> void:
	var error: Variant = await _connect({"from": "Button", "signal": "presed", "method": "_on_button_pressed"})
	assert_true(error is CommandError)
	assert_eq((error as CommandError).code, JsonRpc.NOT_FOUND)
	assert_string_contains((error as CommandError).hint, "pressed")


func test_explains_a_missing_method_with_the_function_to_add() -> void:
	var error: Variant = await _connect({"from": "Area", "signal": "body_entered", "method": "_on_area_body_entered"})
	assert_true(error is CommandError)
	assert_string_contains((error as CommandError).message, "_on_area_body_entered")
	assert_string_contains((error as CommandError).hint, "func _on_area_body_entered(body: Node3D) -> void:")


func test_checks_that_the_method_takes_the_arguments_of_the_signal() -> void:
	var error: Variant = await _connect({"from": "Area", "signal": "body_entered", "method": "_on_button_pressed"})
	assert_true(error is CommandError)
	assert_string_contains((error as CommandError).message, "takes 0 arguments")
	assert_string_contains((error as CommandError).hint, "body: Node3D")


func test_passes_bound_values_as_extra_arguments() -> void:
	var result: Dictionary = await _connect({"from": "Button", "signal": "pressed", "method": "_on_item_picked", "binds": ["key"]})
	assert_eq(result["binds"], ["key"])
	assert_true(_button.is_connected("pressed", Callable(_root, "_on_item_picked").bind("key")))


func test_sets_the_deferred_and_one_shot_flags() -> void:
	var result: Dictionary = await _connect({"from": "Button", "signal": "pressed", "method": "_on_button_pressed", "deferred": true, "one_shot": true})
	assert_eq(result["flags"], ["deferred", "one_shot"])
	var flags := int(_button.get_signal_connection_list("pressed")[0]["flags"])
	assert_true(flags & CONNECT_DEFERRED != 0 and flags & CONNECT_ONE_SHOT != 0)


func test_reports_an_existing_connection_without_another_undo_step() -> void:
	await _connect({"from": "Button", "signal": "pressed", "method": "_on_button_pressed"})
	var result: Dictionary = await _connect({"from": "Button", "signal": "pressed", "method": "_on_button_pressed"})
	assert_true(result["already_connected"])
	assert_true(_history.undo())
	assert_false(_history.undo())


func test_disconnects_and_undo_restores_the_connection_with_its_flags() -> void:
	var picked := Callable(_root, "_on_item_picked").bind("key")
	_button.pressed.connect(picked, CONNECT_PERSIST | CONNECT_DEFERRED)
	var result: Dictionary = await SignalDisconnectCommand.new(_context).execute({"from": "Button", "signal": "pressed", "method": "_on_item_picked"})
	assert_eq(result["method"], "_on_item_picked")
	assert_false(_button.is_connected("pressed", picked))
	assert_eq(_history.last_action_name(), "MCP: Disconnect Button.pressed from Main._on_item_picked")
	assert_true(_history.undo())
	assert_true(_button.is_connected("pressed", picked))
	assert_true(int(_button.get_signal_connection_list("pressed")[0]["flags"]) & CONNECT_DEFERRED != 0)


func test_explains_a_connection_that_does_not_exist() -> void:
	var error: Variant = await SignalDisconnectCommand.new(_context).execute({"from": "Button", "signal": "pressed", "method": "_on_button_pressed"})
	assert_true(error is CommandError)
	assert_eq((error as CommandError).code, JsonRpc.NOT_FOUND)
	assert_string_contains((error as CommandError).message, "not connected")


func test_lists_the_signals_of_a_node_with_their_connections() -> void:
	_area.body_entered.connect(Callable(_root, "_on_body_entered"), CONNECT_PERSIST)
	var result: Dictionary = await SignalListCommand.new(_context).execute({"path": "Area"})
	assert_eq(result["path"], "Area")
	assert_eq(result["type"], "Area3D")
	var body_entered: Dictionary = (result["signals"] as Array).filter(func(entry: Dictionary) -> bool: return entry["name"] == "body_entered")[0]
	assert_eq(body_entered["arguments"], "body: Node3D")
	assert_eq(body_entered["connections"], [{"from": "Area", "signal": "body_entered", "to": ".", "method": "_on_body_entered", "flags": [], "binds": []}])


func test_lists_every_saved_connection_of_the_scene() -> void:
	_button.pressed.connect(Callable(_root, "_on_button_pressed"), CONNECT_PERSIST)
	_area.body_entered.connect(Callable(_root, "_on_body_entered"), CONNECT_PERSIST)
	_area.body_exited.connect(Callable(_root, "_on_body_entered"))
	var result: Dictionary = await SignalListCommand.new(_context).execute({})
	var described: Array = (result["connections"] as Array).map(func(entry: Dictionary) -> String: return "%s.%s" % [entry["from"], entry["signal"]])
	assert_eq(described, ["Button.pressed", "Area.body_entered"])
