extends GutTest

const GodotMcpGameChannel := preload("res://addons/godot_mcp_tool/runtime/game_channel.gd")
const GodotMcpScriptProfile := preload("res://addons/godot_mcp_tool/runtime/script_profile.gd")


class FakeDebugger:
	extends Node

	signal debug_data(message: String, data: Array)


var _switches: Array = []
var _debugger: FakeDebugger
var _channel: GodotMcpGameChannel


func before_each() -> void:
	_switches = []
	_debugger = FakeDebugger.new()
	add_child_autofree(_debugger)
	_channel = GodotMcpGameChannel.new(func(_payload: Dictionary) -> bool: return true, func(_command: String) -> bool: return true, func(profiler: String, enabled: bool, options: Array) -> bool:
		_switches.append([profiler, enabled, options])
		return true)


static func _total(functions: Array) -> Array:
	var total: Array = [120, 0.016, 0.004, 0.002, 0.016, 0.05, 1, "physics_3d", 2, "step", 0.001, functions.size() * 5]
	for function in functions:
		total.append_array(function)
	return total


func test_reads_the_functions_with_their_scripts_lines_and_times() -> void:
	var functions := GodotMcpScriptProfile.functions_in(
		_total([[0, 1200, 0.0853, 0.0901, 0.0], [1, 60, 0.002, 0.0921, 0.0]]),
		{0: "res://enemy.gd::42::Enemy.take_damage", 1: "res://world.gd::10::_process"},
	)
	assert_eq(functions, [
		{"script": "res://enemy.gd", "line": 42, "function": "Enemy.take_damage", "calls": 1200, "self_ms": 85.3, "total_ms": 90.1},
		{"script": "res://world.gd", "line": 10, "function": "_process", "calls": 60, "self_ms": 2.0, "total_ms": 92.1},
	])


func test_leaves_out_functions_that_did_not_run_and_the_measuring_code_of_the_addon() -> void:
	var functions := GodotMcpScriptProfile.functions_in(
		_total([[0, 0, 0.0, 0.0, 0.0], [1, 30, 0.001, 0.002, 0.0], [2, 5, 0.01, 0.01, 0.0]]),
		{0: "res://enemy.gd::12::idle", 1: "res://addons/godot_mcp_tool/runtime/game_time.gd::20::_physics_process", 2: "res://world.gd::3::tick"},
	)
	assert_eq(functions.map(func(function: Dictionary) -> String: return function["function"]), ["tick"])


func test_profiles_the_scripts_of_the_game_while_a_measure_runs() -> void:
	var profile := GodotMcpScriptProfile.new()
	assert_true(profile.start(_channel, [_debugger]))
	_debugger.debug_data.emit("servers:function_signature", ["res://enemy.gd::42::take_damage", 0])
	_debugger.debug_data.emit("servers:profile_frame", [1])
	var finishing := func() -> void:
		await get_tree().process_frame
		_debugger.debug_data.emit("servers:profile_total", _total([[0, 10, 0.5, 0.6, 0.0]]))
	finishing.call()
	var functions: Array = await profile.finish(_channel, 1000)
	assert_eq(_switches, [["servers", true, [GodotMcpScriptProfile.MAXIMUM_FUNCTIONS, false]], ["servers", false, []]])
	assert_eq(functions, [{"script": "res://enemy.gd", "line": 42, "function": "take_damage", "calls": 10, "self_ms": 500.0, "total_ms": 600.0}])
	assert_false(_debugger.debug_data.is_connected(profile._on_debug_data))
