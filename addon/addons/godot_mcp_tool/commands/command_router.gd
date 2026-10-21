extends RefCounted

const Command := preload("command.gd")

var _commands_by_method: Dictionary[String, Command] = {}


func register(method: String, command: Command) -> void:
	_commands_by_method[method] = command


func find(method: String) -> Command:
	return _commands_by_method.get(method)


func methods() -> PackedStringArray:
	var method_names := PackedStringArray(_commands_by_method.keys())
	method_names.sort()
	return method_names
