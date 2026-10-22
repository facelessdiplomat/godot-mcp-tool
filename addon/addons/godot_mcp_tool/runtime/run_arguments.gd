extends RefCounted

const RunRequest := preload("run_request.gd")

const IGNORE_ERROR_BREAKS := "--ignore-error-breaks"
const HEADLESS := "--headless"
const USER_ARGUMENTS_SEPARATOR := "--"
const FIXED_FPS := "--fixed-fps"


static func extend(arguments: PackedStringArray, agent_run: RunRequest, is_editor_headless: bool) -> PackedStringArray:
	var separator_index := arguments.find(USER_ARGUMENTS_SEPARATOR)
	var engine_arguments := arguments if separator_index == -1 else arguments.slice(0, separator_index)
	var user_arguments := PackedStringArray() if separator_index == -1 else arguments.slice(separator_index)
	if agent_run != null and not IGNORE_ERROR_BREAKS in engine_arguments:
		engine_arguments.append(IGNORE_ERROR_BREAKS)
	if agent_run != null and agent_run.fixed_fps > 0 and not FIXED_FPS in engine_arguments:
		engine_arguments.append_array([FIXED_FPS, str(agent_run.fixed_fps)])
	if is_editor_headless and not HEADLESS in engine_arguments:
		engine_arguments.append(HEADLESS)
	return engine_arguments + user_arguments
