extends RefCounted

const GodotMcpCommandError := preload("../commands/command_error.gd")
const GodotMcpJsonRpc := preload("../bridge/json_rpc.gd")
const GodotMcpViewRequests := preload("view_requests.gd")

const MAXIMUM_MARKERS := 12
const CHILDREN := "children"
const BEHIND := "behind the camera"
const OUTSIDE := "outside the frame"
const CAMERA_NEAR := 0.05
const CAMERA_FAR := 4000.0
const MARKERS_FORM := "markers is a list of up to %d node paths, such as [\"Crate1\", \"Crate2\"], or \"children\" for the children of target" % MAXIMUM_MARKERS


static func request_of(description: Dictionary) -> Variant:
	var markers: Variant = description.get("markers")
	if markers == null:
		return []
	if markers is String and markers == CHILDREN:
		var target: Variant = description.get("target", "")
		if not target is String or (target as String).is_empty():
			return "markers \"children\" marks the children of target; give a target"
		return CHILDREN
	if not markers is Array or (markers as Array).is_empty() or (markers as Array).size() > MAXIMUM_MARKERS:
		return MARKERS_FORM
	if not (markers as Array).all(func(path: Variant) -> bool: return path is String and not (path as String).is_empty()):
		return MARKERS_FORM
	return markers


static func read(views: Array, descriptions: Array, bounds_of: Callable, children_of: Callable) -> Variant:
	for index in views.size():
		var description: Variant = descriptions[index]
		var request: Variant = request_of(description) if description is Dictionary else []
		if request is String and request != CHILDREN:
			return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "View %d: %s" % [index + 1, request], "Example: {\"preset\": \"iso\", \"markers\": [\"Crate1\", \"Crate2\"]}, or {\"preset\": \"top\", \"target\": \"Crates\", \"markers\": \"children\"}.")
		views[index]["marker_request"] = request
		if request is String:
			views[index]["marker_target"] = description["target"]
	return resolve(views, bounds_of, children_of)


static func resolve(views: Array, bounds_of: Callable, children_of: Callable) -> Variant:
	for view: Dictionary in views:
		var request: Variant = view.get("marker_request", [])
		var paths: Variant = request
		if request is String:
			paths = children_of.call(view["marker_target"])
			if paths is GodotMcpCommandError:
				return paths
			if (paths as Array).is_empty():
				return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "\"%s\" has no 3D children to mark" % view["marker_target"], "Name the nodes to mark, such as \"markers\": [\"Crate1\", \"Crate2\"].")
		var markers: Array = []
		for path: String in paths:
			if markers.size() == MAXIMUM_MARKERS:
				break
			var bounds: Variant = bounds_of.call(path)
			if bounds is GodotMcpCommandError:
				return bounds
			markers.append({"path": path, "center": (bounds as AABB).get_center()})
		if not markers.is_empty():
			view["markers"] = markers
			view["markers_left_out"] = (paths as Array).size() - markers.size()
	return null


static func project(view: Dictionary, size: Vector2i, point: Vector3) -> Variant:
	var transform: Transform3D = view["transform"]
	if (-transform.basis.z).dot(point - transform.origin) < CAMERA_NEAR:
		return BEHIND
	var aspect := float(size.x) / size.y
	var projection := Projection.create_orthogonal_aspect(view["orthogonal_size"], aspect, CAMERA_NEAR, CAMERA_FAR, false) if view.has("orthogonal_size") else Projection.create_perspective(view["fov"], aspect, CAMERA_NEAR, CAMERA_FAR, false)
	var local := transform.affine_inverse() * point
	var clip := projection * Vector4(local.x, local.y, local.z, 1.0)
	var pixel := Vector2((clip.x / clip.w * 0.5 + 0.5) * size.x, (-clip.y / clip.w * 0.5 + 0.5) * size.y)
	if pixel.x < 0 or pixel.y < 0 or pixel.x >= size.x or pixel.y >= size.y:
		return OUTSIDE
	return pixel


static func place(views: Array, cell_size: Vector2i) -> void:
	for view: Dictionary in views:
		var places: Array = []
		for index in (view.get("markers", []) as Array).size():
			var marker: Dictionary = view["markers"][index]
			var projected: Variant = project(view, cell_size, marker["center"])
			var place := {"number": index + 1, "path": marker["path"]}
			if projected is Vector2:
				place["pixel"] = projected
			else:
				place["not_in_view"] = projected
			places.append(place)
		if not places.is_empty():
			view["marker_places"] = places


static func legend(views: Array, cell_size: Vector2i, scale: float) -> Array:
	var entries: Array = []
	var columns := GodotMcpViewRequests.columns_for(views.size())
	for index in views.size():
		var view: Dictionary = views[index]
		if not view.has("marker_places"):
			continue
		var offset := Vector2(index % columns * (cell_size.x + GodotMcpViewRequests.SHEET_GAP), floori(float(index) / columns) * (cell_size.y + GodotMcpViewRequests.SHEET_GAP))
		var marks: Array = (view["marker_places"] as Array).map(func(place: Dictionary) -> Dictionary: return _mark_of(place, offset, scale))
		entries.append({"view": view["label"], "marks": marks, "left_out": view.get("markers_left_out", 0)})
	return entries


static func legend_of_capture(views: Array, max_size: int, saved: Dictionary) -> Array:
	var scale := float(saved["width"]) / maxf(1.0, float(saved["original_width"]))
	return legend(views, GodotMcpViewRequests.cell_size_for(views.size(), max_size), scale)


static func _mark_of(place: Dictionary, offset: Vector2, scale: float) -> Dictionary:
	var mark := {"number": place["number"], "path": place["path"]}
	if place.has("pixel"):
		var position := ((offset + (place["pixel"] as Vector2)) * scale).round()
		mark["position"] = [int(position.x), int(position.y)]
	else:
		mark["not_in_view"] = place["not_in_view"]
	return mark
