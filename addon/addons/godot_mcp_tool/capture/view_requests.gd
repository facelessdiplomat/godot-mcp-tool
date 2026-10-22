extends RefCounted

const CameraViews := preload("camera_views.gd")
const CommandError := preload("../commands/command_error.gd")
const JsonRpc := preload("../bridge/json_rpc.gd")

const DEFAULT_FOV := 50.0
const MINIMUM_FOV := 1.0
const MAXIMUM_FOV := 179.0
const MAXIMUM_VIEWS := 6
const SHEET_GAP := 8
const CELL_ASPECT := 16.0 / 9.0
const VIEW_FORMS := "a preset name such as \"iso\", {\"preset\": \"front\", \"target\": \"Player\"}, or {\"position\": [0, 10, 10], \"look_at\": [0, 0, 0]}"


static func parse(requests: Array, bounds_of: Callable) -> Variant:
	if requests.size() > MAXIMUM_VIEWS:
		return CommandError.new(JsonRpc.INVALID_PARAMS, "One screenshot holds up to %d views, not %d" % [MAXIMUM_VIEWS, requests.size()], "Take several screenshots for more angles.")
	var views: Array = []
	for index in requests.size():
		var view: Variant = _parse_view(requests[index], bounds_of)
		if view is CommandError:
			return view
		if view is String:
			return CommandError.new(
				JsonRpc.INVALID_PARAMS,
				"View %d: %s" % [index + 1, view],
				"Presets: %s. Each view is %s." % [", ".join(CameraViews.PRESETS), VIEW_FORMS],
			)
		views.append(view)
	return views


static func columns_for(view_count: int) -> int:
	return maxi(1, ceili(sqrt(view_count)))


static func cell_size_for(view_count: int, max_size: int) -> Vector2i:
	var columns := columns_for(view_count)
	var width := floori(float(max_size - SHEET_GAP * (columns - 1)) / columns)
	return Vector2i(width, roundi(width / CELL_ASPECT))


static func labels_of(views: Array) -> Array:
	return views.map(func(view: Dictionary) -> String: return view["label"])


static func _parse_view(request: Variant, bounds_of: Callable) -> Variant:
	if request is String:
		return _preset_view({"preset": request}, bounds_of)
	if not request is Dictionary:
		return "a view is a preset name or an object"
	var description := request as Dictionary
	if description.has("preset"):
		return _preset_view(description, bounds_of)
	if description.has("position"):
		return _positioned_view(description, bounds_of)
	return "give \"preset\" or \"position\""


static func _preset_view(description: Dictionary, bounds_of: Callable) -> Variant:
	var preset := str(description["preset"])
	if not preset in CameraViews.PRESETS:
		return "unknown preset \"%s\"" % preset
	var fov: Variant = _fov_of(description)
	var target: Variant = description.get("target", "")
	if fov is String:
		return fov
	if not target is String:
		return "target is a node path such as \"Player\""
	var bounds: Variant = bounds_of.call(target)
	if bounds is CommandError:
		return bounds
	var default_label := preset if (target as String).is_empty() else "%s of %s" % [preset, target]
	return {"label": _label_of(description, default_label), "transform": CameraViews.preset(preset, bounds, fov), "fov": fov}


static func _positioned_view(description: Dictionary, bounds_of: Callable) -> Variant:
	var position: Variant = _point_of(description["position"])
	var fov: Variant = _fov_of(description)
	if position == null:
		return "position is [x, y, z]"
	if fov is String:
		return fov
	var target: Variant = _look_target_of(description, bounds_of)
	if not target is Vector3:
		return target
	if (target as Vector3).is_equal_approx(position):
		return "the camera cannot look at its own position"
	return {"label": _label_of(description, "from %s" % _point_text(position)), "transform": CameraViews.looking(position, target), "fov": fov}


static func _look_target_of(description: Dictionary, bounds_of: Callable) -> Variant:
	if description.has("look_at"):
		var look_at: Variant = _point_of(description["look_at"])
		return look_at if look_at != null else "look_at is [x, y, z]"
	var target: Variant = description.get("target", "")
	if not target is String:
		return "target is a node path such as \"Player\""
	var bounds: Variant = bounds_of.call(target)
	return (bounds as AABB).get_center() if bounds is AABB else bounds


static func _fov_of(description: Dictionary) -> Variant:
	var fov: Variant = description.get("fov", DEFAULT_FOV)
	if not (fov is int or fov is float) or fov < MINIMUM_FOV or fov > MAXIMUM_FOV:
		return "fov is a number of degrees from %d to %d" % [MINIMUM_FOV, MAXIMUM_FOV]
	return float(fov)


static func _label_of(description: Dictionary, default_label: String) -> String:
	var label: Variant = description.get("label")
	return label if label is String and not (label as String).is_empty() else default_label


static func _point_of(value: Variant) -> Variant:
	if value is Array and (value as Array).size() == 3 and (value as Array).all(func(component: Variant) -> bool: return component is int or component is float):
		return Vector3(value[0], value[1], value[2])
	return null


static func _point_text(point: Vector3) -> String:
	return "(%s, %s, %s)" % [_number_text(point.x), _number_text(point.y), _number_text(point.z)]


static func _number_text(value: float) -> String:
	return str(roundi(value)) if is_equal_approx(value, roundf(value)) else String.num(value, 2)
