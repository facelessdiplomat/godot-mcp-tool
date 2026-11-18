extends RefCounted

const HEADLESS_DISPLAY := "headless"
const WINDOW_SIZE_ARGUMENT_PREFIX := "--mcp-window-size="
const WIDTH_OVERRIDE := "display/window/size/window_width_override"
const HEIGHT_OVERRIDE := "display/window/size/window_height_override"
const VIEWPORT_WIDTH := "display/window/size/viewport_width"
const VIEWPORT_HEIGHT := "display/window/size/viewport_height"


static func is_windowless() -> bool:
	return DisplayServer.get_name() == HEADLESS_DISPLAY


static func give_project_size(window: Window) -> void:
	if is_windowless():
		var requested := requested_window_size(OS.get_cmdline_user_args())
		window.size = requested if requested != Vector2i.ZERO else project_window_size()


static func window_size_argument(size: Vector2i) -> String:
	return "%s%dx%d" % [WINDOW_SIZE_ARGUMENT_PREFIX, size.x, size.y]


static func requested_window_size(user_arguments: PackedStringArray) -> Vector2i:
	for argument in user_arguments:
		if argument.begins_with(WINDOW_SIZE_ARGUMENT_PREFIX):
			var sides := argument.trim_prefix(WINDOW_SIZE_ARGUMENT_PREFIX).split("x")
			if sides.size() == 2 and sides[0].is_valid_int() and sides[1].is_valid_int():
				return Vector2i(sides[0].to_int(), sides[1].to_int())
	return Vector2i.ZERO


static func project_window_size() -> Vector2i:
	var width := int(ProjectSettings.get_setting(WIDTH_OVERRIDE, 0))
	var height := int(ProjectSettings.get_setting(HEIGHT_OVERRIDE, 0))
	if width > 0 and height > 0:
		return Vector2i(width, height)
	return Vector2i(int(ProjectSettings.get_setting(VIEWPORT_WIDTH, 1152)), int(ProjectSettings.get_setting(VIEWPORT_HEIGHT, 648)))
