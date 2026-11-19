extends "../../commands/command.gd"

const GodotMcpInputRecorder := preload("../input_recorder.gd")
const GodotMcpParams := preload("../../commands/params.gd")

const START := "start"
const STOP := "stop"
const MAXIMUM_INLINE_STEPS := 200
const FIRST_STEPS := 20
const FILE_NAME := "recording-%d.json"

var _recorder: GodotMcpInputRecorder
var _directory: String


func _init(recorder: GodotMcpInputRecorder, directory: String) -> void:
	_recorder = recorder
	_directory = directory


func execute(params: Dictionary) -> Variant:
	var state: Variant = GodotMcpParams.required_text(params, "state", "\"start\"")
	if state is GodotMcpCommandError:
		return state
	match state:
		START:
			var restarted := _recorder.is_recording()
			return {"recording": true, "start_frame": _recorder.start(), "restarted": restarted}
		STOP:
			if not _recorder.is_recording():
				return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "Nothing is being recorded", "Start with state \"start\", let the person play, then stop with state \"stop\".")
			return _stopped(_recorder.stop())
	return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "state is \"start\" or \"stop\", not \"%s\"" % state)


func _stopped(recording: Dictionary) -> Variant:
	var steps: Array = recording["steps"]
	var stopped := {
		"start_frame": recording["start_frame"],
		"stop_frame": recording["stop_frame"],
		"physics_frames": recording["physics_frames"],
		"events": recording["events"],
		"count": steps.size(),
	}
	if steps.size() <= MAXIMUM_INLINE_STEPS:
		stopped["steps"] = steps
		return stopped
	var written: Variant = _write(steps)
	if written is GodotMcpCommandError:
		return written
	stopped["path"] = written
	stopped["first_steps"] = steps.slice(0, FIRST_STEPS)
	return stopped


func _write(steps: Array) -> Variant:
	var directory_error := DirAccess.make_dir_recursive_absolute(_directory)
	if directory_error != OK:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.OPERATION_FAILED, "Could not create %s: %s" % [_directory, error_string(directory_error)])
	var path := _directory.path_join(FILE_NAME % Time.get_unix_time_from_system())
	var file := FileAccess.open(path, FileAccess.WRITE)
	if file == null:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.OPERATION_FAILED, "Could not write %s: %s" % [path, error_string(FileAccess.get_open_error())])
	file.store_string(JSON.stringify(steps))
	file.close()
	return path
