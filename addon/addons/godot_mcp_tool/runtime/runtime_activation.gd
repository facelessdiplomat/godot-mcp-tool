extends RefCounted

const LogFileWriter := preload("log_file_writer.gd")

enum Mode { OFF, EDITOR, SERVER }


static func mode_of(debugger_active: bool, debug_build: bool, user_arguments: PackedStringArray) -> Mode:
	if debugger_active:
		return Mode.EDITOR
	if debug_build and not LogFileWriter.path_from_arguments(user_arguments).is_empty():
		return Mode.SERVER
	return Mode.OFF
