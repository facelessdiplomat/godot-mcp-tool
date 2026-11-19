extends RefCounted

const GodotMcpAddonInfo := preload("../addon_info.gd")

const ITEM_TEXT := "Allow Unsafe Tools in This Project"


func is_allowed() -> bool:
	return bool(EditorInterface.get_editor_settings().get_project_metadata(GodotMcpAddonInfo.SETTINGS_SECTION, GodotMcpAddonInfo.UNSAFE_TOOLS_KEY, false))


func set_allowed(allowed: bool) -> void:
	EditorInterface.get_editor_settings().set_project_metadata(GodotMcpAddonInfo.SETTINGS_SECTION, GodotMcpAddonInfo.UNSAFE_TOOLS_KEY, allowed)
	print("Godot MCP Tool: unsafe tools are %s in this project." % ("allowed" if allowed else "turned off"))
