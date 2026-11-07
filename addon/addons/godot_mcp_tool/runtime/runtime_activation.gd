extends RefCounted

const GodotMcpLogFileWriter := preload("log_file_writer.gd")

enum GodotMcpMode { OFF, EDITOR, SERVER }


static func mode_of(debugger_active: bool, debug_build: bool, user_arguments: PackedStringArray) -> GodotMcpMode:
	if debugger_active:
		return GodotMcpMode.EDITOR
	if debug_build and not GodotMcpLogFileWriter.path_from_arguments(user_arguments).is_empty():
		return GodotMcpMode.SERVER
	return GodotMcpMode.OFF
