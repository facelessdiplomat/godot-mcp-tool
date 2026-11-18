extends RefCounted

const GodotMcpCommandError := preload("../commands/command_error.gd")
const GodotMcpHeadlessWindow := preload("../runtime/headless_window.gd")
const GodotMcpJsonRpc := preload("../bridge/json_rpc.gd")

const MAXIMUM_SIZES := 6
const MAXIMUM_SIDE := 7680
const LARGEST_NAMED_RATIO_SIDE := 32
const STRETCH_MODE := "display/window/stretch/mode"
const STRETCH_ASPECT := "display/window/stretch/aspect"
const EXAMPLE := "Example: {\"sizes\": [[1920, 1080], [1440, 1080]]} renders 16:9 and 4:3 side by side."


static func parse(requested: Variant) -> Variant:
	if requested == null:
		return [GodotMcpHeadlessWindow.project_window_size()]
	if not requested is Array or (requested as Array).is_empty() or (requested as Array).size() > MAXIMUM_SIZES:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "\"sizes\" lists 1 to %d window sizes as [width, height]" % MAXIMUM_SIZES, EXAMPLE)
	var sizes: Array = []
	for size in requested:
		if not _is_size(size):
			return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "%s is not a window size; give [width, height] in pixels, each from 1 to %d" % [JSON.stringify(size), MAXIMUM_SIDE], EXAMPLE)
		sizes.append(Vector2i(int(size[0]), int(size[1])))
	return sizes


static func label_of(size: Vector2i) -> String:
	var divisor := _greatest_common_divisor(size.x, size.y)
	var ratio := "%d:%d" % [size.x / divisor, size.y / divisor] if size.x / divisor <= LARGEST_NAMED_RATIO_SIDE else "%s:1" % String.num(float(size.x) / size.y, 2)
	return "%d×%d (%s)" % [size.x, size.y, ratio]


static func layout_size_for(window: Vector2i, base: Vector2i, mode: String, aspect: String) -> Vector2i:
	if mode == "disabled":
		return window
	var window_ratio := float(window.x) / window.y
	var base_ratio := float(base.x) / base.y
	var wider := window_ratio > base_ratio
	match aspect:
		"expand":
			return Vector2i(roundi(base.y * window_ratio), base.y) if wider else Vector2i(base.x, roundi(base.x / window_ratio))
		"keep_width":
			return base if wider else Vector2i(base.x, roundi(base.x / window_ratio))
		"keep_height":
			return Vector2i(roundi(base.y * window_ratio), base.y) if wider else base
	return base


static func content_size_for(window: Vector2i, layout: Vector2i, aspect: String) -> Vector2i:
	if aspect == "ignore":
		return window
	var scale := minf(float(window.x) / layout.x, float(window.y) / layout.y)
	return Vector2i(mini(window.x, roundi(layout.x * scale)), mini(window.y, roundi(layout.y * scale)))


static func project_layout_size_for(window: Vector2i) -> Vector2i:
	return layout_size_for(window, _base_size(), _stretch_mode(), _stretch_aspect())


static func project_content_size_for(window: Vector2i, layout: Vector2i) -> Vector2i:
	return content_size_for(window, layout, _stretch_aspect()) if _stretch_mode() != "disabled" else window


static func _base_size() -> Vector2i:
	return Vector2i(int(ProjectSettings.get_setting(GodotMcpHeadlessWindow.VIEWPORT_WIDTH, 1152)), int(ProjectSettings.get_setting(GodotMcpHeadlessWindow.VIEWPORT_HEIGHT, 648)))


static func _stretch_mode() -> String:
	return str(ProjectSettings.get_setting(STRETCH_MODE, "disabled"))


static func _stretch_aspect() -> String:
	return str(ProjectSettings.get_setting(STRETCH_ASPECT, "keep"))


static func _is_size(value: Variant) -> bool:
	if not value is Array or (value as Array).size() != 2:
		return false
	for side in value:
		if not (side is int or side is float) or int(side) < 1 or int(side) > MAXIMUM_SIDE or float(side) != floorf(float(side)):
			return false
	return true


static func _greatest_common_divisor(left: int, right: int) -> int:
	while right != 0:
		var remainder := left % right
		left = right
		right = remainder
	return left
