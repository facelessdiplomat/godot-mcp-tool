extends "command.gd"

const Command := preload("command.gd")

var _inner: Command
var _is_allowed: Callable


func _init(inner: Command, is_allowed: Callable) -> void:
	_inner = inner
	_is_allowed = is_allowed


func execute(params: Dictionary) -> Variant:
	if not _is_allowed.call():
		return CommandError.new(
			JsonRpc.UNSAFE_DISABLED,
			"Unsafe tools are turned off in the editor for this project",
			"The user can turn them on in the editor with Project → Tools → Godot MCP Tool → Allow Unsafe Tools.",
		)
	return await _inner.execute(params)
