extends "command.gd"

const GodotMcpCommand := preload("command.gd")
const GodotMcpToolsMenu := preload("../editor/tools_menu.gd")
const GodotMcpUnsafeToolsSwitch := preload("../editor/unsafe_tools_switch.gd")

var _inner: GodotMcpCommand
var _is_allowed: Callable


func _init(inner: GodotMcpCommand, is_allowed: Callable) -> void:
	_inner = inner
	_is_allowed = is_allowed


func execute(params: Dictionary) -> Variant:
	if not _is_allowed.call():
		return GodotMcpCommandError.new(
			GodotMcpJsonRpc.UNSAFE_DISABLED,
			"Unsafe tools are turned off in the editor for this project",
			"The user can turn them on in the editor with Project → Tools → %s → %s." % [GodotMcpToolsMenu.MENU_TITLE, GodotMcpUnsafeToolsSwitch.ITEM_TEXT],
		)
	return await _inner.execute(params)
