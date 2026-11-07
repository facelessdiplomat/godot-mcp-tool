extends RefCounted

const GodotMcpCommand := preload("command.gd")

var _commands_by_method: Dictionary[String, GodotMcpCommand] = {}


func register(method: String, command: GodotMcpCommand) -> void:
	_commands_by_method[method] = command


func find(method: String) -> GodotMcpCommand:
	return _commands_by_method.get(method)


func methods() -> PackedStringArray:
	var method_names := PackedStringArray(_commands_by_method.keys())
	method_names.sort()
	return method_names
