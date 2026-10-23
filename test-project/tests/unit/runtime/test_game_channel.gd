extends GutTest

const CommandError := preload("res://addons/godot_mcp_tool/commands/command_error.gd")
const GameChannel := preload("res://addons/godot_mcp_tool/runtime/game_channel.gd")
const JsonRpc := preload("res://addons/godot_mcp_tool/bridge/json_rpc.gd")

var _sent: Array = []
var _channel: GameChannel


func before_each() -> void:
	_sent = []
	_channel = GameChannel.new(func(payload: Dictionary) -> bool:
		_sent.append(payload)
		return true)


func _answer_after_a_frame(answer: Dictionary) -> void:
	await get_tree().process_frame
	var reply := answer.duplicate()
	reply["id"] = (_sent.back() as Dictionary)["id"]
	_channel.receive(reply)


func _stop_after_a_frame() -> void:
	await get_tree().process_frame
	_channel.cancel_all("The game stopped before it answered.")


func _break_after_a_frame() -> void:
	await get_tree().process_frame
	_channel.end_frame_waits()


func test_sends_a_request_and_returns_the_answer() -> void:
	_answer_after_a_frame({"result": {"node_count": 3}})
	var outcome: Variant = await _channel.request("tree", {"path": "."}, 1000)
	assert_eq(outcome, {"node_count": 3})
	assert_eq((_sent[0] as Dictionary)["method"], "tree")
	assert_eq((_sent[0] as Dictionary)["params"], {"path": "."})


func test_turns_an_error_answer_into_a_command_error() -> void:
	_answer_after_a_frame({"error": {"code": JsonRpc.NOT_FOUND, "message": "Node \"Plyer\" not found", "hint": "Similar: Player."}})
	var outcome: Variant = await _channel.request("properties.get", {"path": "Plyer"}, 1000)
	assert_true(outcome is CommandError)
	assert_eq((outcome as CommandError).code, JsonRpc.NOT_FOUND)
	assert_eq((outcome as CommandError).hint, "Similar: Player.")


func test_reports_a_game_that_does_not_answer() -> void:
	var outcome: Variant = await _channel.request("tree", {}, 30)
	assert_true(outcome is CommandError)
	assert_eq((outcome as CommandError).code, JsonRpc.TIMEOUT)


func test_reports_that_no_game_is_running_when_it_cannot_send() -> void:
	var channel := GameChannel.new(func(_payload: Dictionary) -> bool: return false)
	var outcome: Variant = await channel.request("tree", {}, 1000)
	assert_true(outcome is CommandError)
	assert_eq((outcome as CommandError).code, JsonRpc.GAME_NOT_RUNNING)


func test_ends_waiting_requests_when_the_game_stops() -> void:
	_stop_after_a_frame()
	var started_msec := Time.get_ticks_msec()
	var outcome: Variant = await _channel.request("wait", {"ms": 5000}, 10000)
	assert_true(outcome is CommandError)
	assert_eq((outcome as CommandError).code, JsonRpc.GAME_NOT_RUNNING)
	assert_lt(Time.get_ticks_msec() - started_msec, 1000)


func test_numbers_each_request() -> void:
	_answer_after_a_frame({"result": {}})
	await _channel.request("tree", {}, 1000)
	_answer_after_a_frame({"result": {}})
	await _channel.request("tree", {}, 1000)
	assert_ne((_sent[0] as Dictionary)["id"], (_sent[1] as Dictionary)["id"])


func test_ends_requests_that_wait_on_frames_when_the_game_stops_in_the_debugger() -> void:
	_break_after_a_frame()
	var started_msec := Time.get_ticks_msec()
	var outcome: Variant = await _channel.request("input", {"steps": [{"wait_ms": 5000}]}, 10000, true)
	assert_true(outcome is CommandError)
	assert_eq((outcome as CommandError).code, JsonRpc.CONFLICT)
	assert_eq((outcome as CommandError).message, "The game stopped in the debugger before this call finished; its frames do not advance while it is stopped")
	assert_eq((outcome as CommandError).hint, "debug_state shows where it stopped; debug_continue resumes the game, and the rest of this call plays out then.")
	assert_lt(Time.get_ticks_msec() - started_msec, 1000)


func test_still_waits_for_the_answer_to_a_read_when_the_game_stops_in_the_debugger() -> void:
	_break_after_a_frame()
	_answer_after_a_frame({"result": {"node_count": 3}})
	var outcome: Variant = await _channel.request("tree", {}, 1000)
	assert_eq(outcome, {"node_count": 3})
