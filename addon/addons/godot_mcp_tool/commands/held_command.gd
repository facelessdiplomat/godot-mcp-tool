extends "command.gd"

const GodotMcpChangesHoldSwitch := preload("../editor/changes_hold_switch.gd")
const GodotMcpCommand := preload("command.gd")
const GodotMcpToolsMenu := preload("../editor/tools_menu.gd")

var _inner: GodotMcpCommand
var _is_held: Callable


func _init(inner: GodotMcpCommand, is_held: Callable) -> void:
	_inner = inner
	_is_held = is_held


func execute(params: Dictionary) -> Variant:
	if _is_held.call():
		return GodotMcpCommandError.new(
			GodotMcpJsonRpc.CHANGES_HELD,
			"Changes are held in the editor, so this was not done",
			"The user turned on Project → Tools → %s → %s, or the switch in the Godot MCP panel: reading the project and the running game works, but changes to scenes, resources, files and settings and starting the game wait until the user turns it off. Tell the user what you would change, or ask them to turn it off." % [GodotMcpToolsMenu.MENU_TITLE, GodotMcpChangesHoldSwitch.ITEM_TEXT],
		)
	return await _inner.execute(params)
