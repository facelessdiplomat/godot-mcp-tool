extends RefCounted

const GodotVersionText := preload("godot_version_text.gd")

const MINIMUM_MAJOR := 4
const MINIMUM_MINOR := 7


static func problem_with(version_info: Dictionary) -> String:
	var major := int(version_info.get("major", 0))
	var minor := int(version_info.get("minor", 0))
	if major > MINIMUM_MAJOR or (major == MINIMUM_MAJOR and minor >= MINIMUM_MINOR):
		return ""
	var minimum := "%d.%d" % [MINIMUM_MAJOR, MINIMUM_MINOR]
	return "Godot MCP Tool needs Godot %s or newer, and this editor is Godot %s, so the plugin does not start. Open the project in Godot %s or newer, or disable the plugin in Project → Project Settings → Plugins." % [minimum, GodotVersionText.from_version_info(version_info), minimum]
