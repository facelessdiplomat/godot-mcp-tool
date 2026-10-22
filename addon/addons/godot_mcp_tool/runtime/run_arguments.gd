extends RefCounted

const IGNORE_ERROR_BREAKS := "--ignore-error-breaks"
const HEADLESS := "--headless"
const USER_ARGUMENTS_SEPARATOR := "--"


static func extend(arguments: PackedStringArray, is_agent_run: bool, is_editor_headless: bool) -> PackedStringArray:
	var separator_index := arguments.find(USER_ARGUMENTS_SEPARATOR)
	var engine_arguments := arguments if separator_index == -1 else arguments.slice(0, separator_index)
	var user_arguments := PackedStringArray() if separator_index == -1 else arguments.slice(separator_index)
	if is_agent_run and not IGNORE_ERROR_BREAKS in engine_arguments:
		engine_arguments.append(IGNORE_ERROR_BREAKS)
	if is_editor_headless and not HEADLESS in engine_arguments:
		engine_arguments.append(HEADLESS)
	return engine_arguments + user_arguments
