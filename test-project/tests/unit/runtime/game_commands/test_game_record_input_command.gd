extends GutTest

const GodotMcpCommandError := preload("res://addons/godot_mcp_tool/commands/command_error.gd")
const GodotMcpGameRecordInputCommand := preload("res://addons/godot_mcp_tool/runtime/game_commands/game_record_input_command.gd")
const GodotMcpInputRecorder := preload("res://addons/godot_mcp_tool/runtime/input_recorder.gd")
const GodotMcpJsonRpc := preload("res://addons/godot_mcp_tool/bridge/json_rpc.gd")

const FOLDER := "user://record_input_command"


class FixedRecorder:
	extends GodotMcpInputRecorder

	var recording := false
	var steps: Array = []

	func _init() -> void:
		super(null)

	func is_recording() -> bool:
		return recording

	func start() -> int:
		recording = true
		return 120

	func stop() -> Dictionary:
		recording = false
		return {"start_frame": 120, "stop_frame": 300, "physics_frames": 180, "events": steps.size(), "steps": steps}


var _recorder: FixedRecorder
var _command: GodotMcpGameRecordInputCommand


func before_each() -> void:
	_recorder = FixedRecorder.new()
	_command = GodotMcpGameRecordInputCommand.new(_recorder, ProjectSettings.globalize_path(FOLDER))


func after_each() -> void:
	for file_name in DirAccess.get_files_at(FOLDER):
		DirAccess.remove_absolute(FOLDER.path_join(file_name))


func test_starts_recording_and_says_from_which_frame() -> void:
	assert_eq(_command.execute({"state": "start"}), {"recording": true, "start_frame": 120, "restarted": false})
	assert_eq(_command.execute({"state": "start"})["restarted"], true)


func test_returns_the_steps_of_a_short_recording() -> void:
	_recorder.steps = [{"wait_physics_frames": 30}, {"action": "jump", "physics_frames": 4}]
	_command.execute({"state": "start"})

	var stopped: Dictionary = _command.execute({"state": "stop"})

	assert_eq(stopped["steps"], _recorder.steps)
	assert_eq(stopped["count"], 2)
	assert_eq(stopped["physics_frames"], 180)
	assert_false(stopped.has("path"))


func test_writes_a_long_recording_to_a_file_and_returns_its_first_steps() -> void:
	for index in 250:
		_recorder.steps.append({"wait_physics_frames": index + 1})
	_command.execute({"state": "start"})

	var stopped: Dictionary = _command.execute({"state": "stop"})

	assert_eq(stopped["count"], 250)
	assert_false(stopped.has("steps"))
	assert_eq(stopped["first_steps"], _recorder.steps.slice(0, GodotMcpGameRecordInputCommand.FIRST_STEPS))
	assert_eq(FileAccess.get_file_as_string(stopped["path"]), JSON.stringify(_recorder.steps))


func test_refuses_to_stop_what_it_never_started() -> void:
	var refused: Variant = _command.execute({"state": "stop"})

	assert_true(refused is GodotMcpCommandError)
	assert_string_contains((refused as GodotMcpCommandError).message, "Nothing is being recorded")


func test_refuses_an_unknown_state() -> void:
	var refused: Variant = _command.execute({"state": "pause"})

	assert_true(refused is GodotMcpCommandError)
	assert_eq((refused as GodotMcpCommandError).code, GodotMcpJsonRpc.INVALID_PARAMS)
