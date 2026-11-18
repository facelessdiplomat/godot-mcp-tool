extends RefCounted

const GodotMcpRunRequest := preload("run_request.gd")

const IGNORE_ERROR_BREAKS := "--ignore-error-breaks"
const HEADLESS := "--headless"
const USER_ARGUMENTS_SEPARATOR := "--"
const FIXED_FPS := "--fixed-fps"
const RESOLUTION := "--resolution"
const LANGUAGE := "--language"
const DEBUG_DRAW_FLAGS := {
	"collisions": "--debug-collisions",
	"navigation": "--debug-navigation",
	"paths": "--debug-paths",
	"avoidance": "--debug-avoidance",
}


static func extend(arguments: PackedStringArray, agent_run: GodotMcpRunRequest, is_editor_headless: bool) -> PackedStringArray:
	var separator_index := arguments.find(USER_ARGUMENTS_SEPARATOR)
	var engine_arguments := arguments if separator_index == -1 else arguments.slice(0, separator_index)
	var user_arguments := PackedStringArray() if separator_index == -1 else arguments.slice(separator_index)
	if agent_run != null and not agent_run.break_on_error and not IGNORE_ERROR_BREAKS in engine_arguments:
		engine_arguments.append(IGNORE_ERROR_BREAKS)
	if agent_run != null and agent_run.fixed_fps > 0 and not FIXED_FPS in engine_arguments:
		engine_arguments.append_array([FIXED_FPS, str(agent_run.fixed_fps)])
	if is_editor_headless and not HEADLESS in engine_arguments:
		engine_arguments.append(HEADLESS)
	if agent_run != null:
		_add_requested_options(engine_arguments, agent_run)
		if not agent_run.arguments.is_empty():
			if user_arguments.is_empty():
				user_arguments.append(USER_ARGUMENTS_SEPARATOR)
			user_arguments.append_array(agent_run.arguments)
	return engine_arguments + user_arguments


static func _add_requested_options(engine_arguments: PackedStringArray, agent_run: GodotMcpRunRequest) -> void:
	for drawing in agent_run.debug_draw:
		var flag: String = DEBUG_DRAW_FLAGS[drawing]
		if not flag in engine_arguments:
			engine_arguments.append(flag)
	if agent_run.window_size != Vector2i.ZERO and not RESOLUTION in engine_arguments:
		engine_arguments.append_array([RESOLUTION, "%dx%d" % [agent_run.window_size.x, agent_run.window_size.y]])
	if not agent_run.locale.is_empty() and not LANGUAGE in engine_arguments:
		engine_arguments.append_array([LANGUAGE, agent_run.locale])
