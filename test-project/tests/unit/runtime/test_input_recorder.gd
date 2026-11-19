extends GutTest

const GodotMcpGameTime := preload("res://addons/godot_mcp_tool/runtime/game_time.gd")
const GodotMcpInputRecorder := preload("res://addons/godot_mcp_tool/runtime/input_recorder.gd")

const DASH_ACTION := "recorder_test_dash"

var _time: GodotMcpGameTime
var _recorder: GodotMcpInputRecorder


func before_each() -> void:
	InputMap.add_action(DASH_ACTION)
	var key := InputEventKey.new()
	key.physical_keycode = KEY_K
	InputMap.action_add_event(DASH_ACTION, key)
	_time = GodotMcpGameTime.new()
	add_child_autoqfree(_time)
	_recorder = GodotMcpInputRecorder.new(_time)


func after_each() -> void:
	if _recorder.is_recording():
		_recorder.stop()
	Input.action_release(DASH_ACTION)
	InputMap.erase_action(DASH_ACTION)


func _key(code: Key, pressed: bool) -> InputEventKey:
	var event := InputEventKey.new()
	event.physical_keycode = code
	event.pressed = pressed
	return event


func _as_a_person(event: InputEvent) -> void:
	Input.parse_input_event(event)
	Input.flush_buffered_events()


func test_records_what_a_person_plays_as_steps_from_the_start() -> void:
	_recorder.start()
	await wait_physics_frames(3)
	_as_a_person(_key(KEY_K, true))
	await wait_physics_frames(4)
	_as_a_person(_key(KEY_K, false))

	var recording := _recorder.stop()

	var steps: Array = recording["steps"]
	assert_eq(steps.size(), 2)
	assert_eq((steps[0] as Dictionary).keys(), ["wait_physics_frames"])
	assert_eq(steps[1]["action"], DASH_ACTION)
	assert_between(int(steps[1]["physics_frames"]), 3, 5)
	assert_eq(recording["physics_frames"], int(recording["stop_frame"]) - int(recording["start_frame"]))


func test_leaves_out_the_input_that_game_input_delivers() -> void:
	_recorder.start()
	_time.deliver(_key(KEY_K, true))
	_time.deliver(_key(KEY_K, false))

	assert_eq(_recorder.stop()["steps"], [])


func test_stops_listening_once_stopped() -> void:
	_recorder.start()
	_recorder.stop()
	_as_a_person(_key(KEY_K, true))
	_as_a_person(_key(KEY_K, false))

	assert_false(_recorder.is_recording())
	_recorder.start()
	assert_eq(_recorder.stop()["steps"], [])
