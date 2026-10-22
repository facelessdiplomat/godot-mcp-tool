extends GutTest

const CommandError := preload("res://addons/godot_mcp_tool/commands/command_error.gd")
const GameEvalCommand := preload("res://addons/godot_mcp_tool/runtime/game_commands/game_eval_command.gd")
const GameScene := preload("res://addons/godot_mcp_tool/runtime/game_commands/game_scene.gd")
const JsonRpc := preload("res://addons/godot_mcp_tool/bridge/json_rpc.gd")
const VariantCodec := preload("res://addons/godot_mcp_tool/codec/variant_codec.gd")

var _arena: Node3D
var _player: Node3D
var _command: GameEvalCommand


func before_each() -> void:
	_arena = Node3D.new()
	_arena.name = "Arena"
	_player = Node3D.new()
	_player.name = "Player"
	_player.position = Vector3(1, 2, 3)
	_arena.add_child(_player)
	add_child_autofree(_arena)
	_command = GameEvalCommand.new(GameScene.new(func() -> Node: return _arena), VariantCodec.new())


func test_evaluates_an_expression_on_a_node() -> void:
	var result: Dictionary = await _command.execute({"expression": "position.y * 2", "node": "Player"})
	assert_eq(result["node"], "Player")
	assert_eq(result["value"], 4.0)
	assert_eq(result["type"], "float")


func test_evaluates_on_the_scene_root_by_default_and_calls_methods() -> void:
	var result: Dictionary = await _command.execute({"expression": "get_child_count() + get_node(\"Player\").position.x"})
	assert_eq(result["node"], ".")
	assert_eq(result["value"], 2.0)


func test_changes_state_through_methods() -> void:
	await _command.execute({"expression": "set(\"position\", Vector3(0, 9, 0))", "node": "Player"})
	assert_eq(_player.position, Vector3(0, 9, 0))


func test_reports_expressions_that_do_not_parse_or_fail() -> void:
	var broken: CommandError = await _command.execute({"expression": "position.y +", "node": "Player"})
	var failing: CommandError = await _command.execute({"expression": "no_such_method()", "node": "Player"})
	var missing: CommandError = await _command.execute({"expression": "1", "node": "Ghost"})
	assert_eq(broken.code, JsonRpc.INVALID_PARAMS)
	assert_string_contains(broken.message, "does not parse")
	assert_string_contains(failing.message, "failed")
	assert_eq(missing.code, JsonRpc.NOT_FOUND)
