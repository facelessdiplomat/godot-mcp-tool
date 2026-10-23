extends GutTest

const CommandError := preload("res://addons/godot_mcp_tool/commands/command_error.gd")
const GameScene := preload("res://addons/godot_mcp_tool/runtime/game_commands/game_scene.gd")
const GameTime := preload("res://addons/godot_mcp_tool/runtime/game_time.gd")
const GameWaitCommand := preload("res://addons/godot_mcp_tool/runtime/game_commands/game_wait_command.gd")
const JsonRpc := preload("res://addons/godot_mcp_tool/bridge/json_rpc.gd")
const VariantCodec := preload("res://addons/godot_mcp_tool/codec/variant_codec.gd")

var _arena: Node3D
var _player: Node3D
var _time: GameTime
var _command: GameWaitCommand


func before_each() -> void:
	_arena = Node3D.new()
	_arena.name = "Arena"
	_player = Node3D.new()
	_player.name = "Player"
	_arena.add_child(_player)
	add_child_autofree(_arena)
	_time = GameTime.new()
	add_child_autoqfree(_time)
	_command = GameWaitCommand.new(GameScene.new(func() -> Node: return _arena), VariantCodec.new(), _time)


func after_each() -> void:
	get_tree().paused = false


func test_waits_for_physics_frames() -> void:
	var result: Dictionary = await _command.execute({"physics_frames": 2})
	assert_eq(result["physics_frames"], 2)


func test_waits_for_frames() -> void:
	var result: Dictionary = await _command.execute({"frames": 3})
	assert_eq(result["frames"], 3)


func test_waits_for_milliseconds() -> void:
	var result: Dictionary = await _command.execute({"ms": 30})
	assert_gte(result["waited_ms"], 25)


func test_waits_until_a_condition_holds_on_a_node() -> void:
	_player.set_meta("landed", false)
	get_tree().create_timer(0.05).timeout.connect(func() -> void: _player.set_meta("landed", true))
	var result: Dictionary = await _command.execute({"condition": "get_meta(\"landed\")", "node": "Player", "timeout_ms": 2000})
	assert_true(result["met"])
	assert_eq(result["value"], true)
	assert_gt(result["physics_frames"], 0)


func test_gives_up_waiting_after_the_timeout() -> void:
	var result: Dictionary = await _command.execute({"condition": "position.y > 100", "node": "Player", "timeout_ms": 50})
	assert_false(result["met"])
	assert_eq(result["value"], false)


func test_explains_a_condition_that_does_not_parse() -> void:
	var error: Variant = await _command.execute({"condition": "1 +"})
	assert_true(error is CommandError)
	assert_eq((error as CommandError).code, JsonRpc.INVALID_PARAMS)


func test_explains_a_condition_that_fails_to_run() -> void:
	var error: Variant = await _command.execute({"condition": "no_such_method()", "node": "Player"})
	assert_true(error is CommandError)
	assert_string_contains((error as CommandError).message, "no_such_method")


func test_asks_for_exactly_one_thing_to_wait_for() -> void:
	assert_true(await _command.execute({}) is CommandError)
	assert_true(await _command.execute({"frames": 1, "ms": 10}) is CommandError)


func test_advances_a_held_game_while_it_waits_and_holds_it_again() -> void:
	_time.hold()
	var frames := _time.frames
	var result: Dictionary = await _command.execute({"physics_frames": 4})
	assert_eq(_time.frames - frames, 4)
	assert_true(result["paused"])
	assert_true(get_tree().paused)


func test_holds_the_game_on_the_frame_where_the_condition_became_true() -> void:
	var script := GDScript.new()
	script.source_code = "extends Node\n\nvar ticks := 0\n\n\nfunc _physics_process(_delta: float) -> void:\n\tticks += 1\n"
	script.reload()
	var counter := Node.new()
	counter.name = "Counter"
	counter.set_script(script)
	counter.process_mode = Node.PROCESS_MODE_PAUSABLE
	_arena.add_child(counter)
	_time.hold()
	var target: int = counter.get("ticks") + 3
	var result: Dictionary = await _command.execute({"condition": "ticks >= %d" % target, "node": "Counter", "timeout_ms": 2000})
	assert_true(result["met"])
	assert_eq(result["physics_frames"], 3)
	assert_eq(counter.get("ticks"), target)
	assert_true(get_tree().paused)
