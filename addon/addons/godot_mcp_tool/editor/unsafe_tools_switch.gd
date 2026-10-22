extends RefCounted

const AddonInfo := preload("../addon_info.gd")

const MENU_TITLE := "Godot MCP Tool"
const ALLOW_ITEM_TEXT := "Allow Unsafe Tools in This Project"
const ALLOW_ITEM_ID := 0

var _menu: PopupMenu


func is_allowed() -> bool:
	return bool(EditorInterface.get_editor_settings().get_project_metadata(AddonInfo.SETTINGS_SECTION, AddonInfo.UNSAFE_TOOLS_KEY, false))


func install(plugin: EditorPlugin) -> void:
	_menu = PopupMenu.new()
	_menu.add_check_item(ALLOW_ITEM_TEXT, ALLOW_ITEM_ID)
	_menu.set_item_checked(_menu.get_item_index(ALLOW_ITEM_ID), is_allowed())
	_menu.id_pressed.connect(_on_item_pressed)
	plugin.add_tool_submenu_item(MENU_TITLE, _menu)


func uninstall(plugin: EditorPlugin) -> void:
	plugin.remove_tool_menu_item(MENU_TITLE)
	if is_instance_valid(_menu):
		_menu.queue_free()
	_menu = null


func _on_item_pressed(item_id: int) -> void:
	if item_id != ALLOW_ITEM_ID:
		return
	var allowed := not is_allowed()
	EditorInterface.get_editor_settings().set_project_metadata(AddonInfo.SETTINGS_SECTION, AddonInfo.UNSAFE_TOOLS_KEY, allowed)
	_menu.set_item_checked(_menu.get_item_index(ALLOW_ITEM_ID), allowed)
	print("Godot MCP Tool: unsafe tools are %s in this project." % ("allowed" if allowed else "turned off"))
