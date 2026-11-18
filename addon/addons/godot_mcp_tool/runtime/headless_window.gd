extends RefCounted

const HEADLESS_DISPLAY := "headless"
const WIDTH_OVERRIDE := "display/window/size/window_width_override"
const HEIGHT_OVERRIDE := "display/window/size/window_height_override"
const VIEWPORT_WIDTH := "display/window/size/viewport_width"
const VIEWPORT_HEIGHT := "display/window/size/viewport_height"


static func is_windowless() -> bool:
	return DisplayServer.get_name() == HEADLESS_DISPLAY


static func give_project_size(window: Window) -> void:
	if is_windowless():
		window.size = project_window_size()


static func project_window_size() -> Vector2i:
	var width := int(ProjectSettings.get_setting(WIDTH_OVERRIDE, 0))
	var height := int(ProjectSettings.get_setting(HEIGHT_OVERRIDE, 0))
	if width > 0 and height > 0:
		return Vector2i(width, height)
	return Vector2i(int(ProjectSettings.get_setting(VIEWPORT_WIDTH, 1152)), int(ProjectSettings.get_setting(VIEWPORT_HEIGHT, 648)))
