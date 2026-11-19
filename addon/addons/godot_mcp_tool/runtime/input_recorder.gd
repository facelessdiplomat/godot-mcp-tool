extends RefCounted

const GodotMcpGameTime := preload("game_time.gd")
const GodotMcpInputRecording := preload("../input/input_recording.gd")

const BUILT_IN_ACTION_PREFIX := "ui_"
const NOT_RECORDING := -1

var _time: GodotMcpGameTime
var _records: Array = []
var _start_frame := NOT_RECORDING


func _init(time: GodotMcpGameTime) -> void:
	_time = time


func is_recording() -> bool:
	return _start_frame != NOT_RECORDING


func start() -> int:
	var window := _root_window()
	if not window.window_input.is_connected(_on_input):
		window.window_input.connect(_on_input)
	_records.clear()
	_start_frame = _time.frames
	return _start_frame


func stop() -> Dictionary:
	var window := _root_window()
	if window.window_input.is_connected(_on_input):
		window.window_input.disconnect(_on_input)
	var stop_frame := _time.frames
	var recording := {
		"start_frame": _start_frame,
		"stop_frame": stop_frame,
		"physics_frames": stop_frame - _start_frame,
		"events": _records.size(),
		"steps": GodotMcpInputRecording.steps_of(_records, _start_frame, stop_frame),
	}
	_records = []
	_start_frame = NOT_RECORDING
	return recording


func _on_input(event: InputEvent) -> void:
	if _time.is_delivering():
		return
	var to_view := _root_window().get_final_transform().affine_inverse()
	var record: Variant = GodotMcpInputRecording.record_of(event, _time.frames, to_view, _action_of)
	if record != null:
		_records.append(record)


static func _action_of(event: InputEvent) -> String:
	for action in InputMap.get_actions():
		if not str(action).begins_with(BUILT_IN_ACTION_PREFIX) and InputMap.event_is_action(event, action):
			return str(action)
	return ""


static func _root_window() -> Window:
	return (Engine.get_main_loop() as SceneTree).root
