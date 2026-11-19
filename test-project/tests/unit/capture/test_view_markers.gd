extends GutTest

const GodotMcpCameraViews := preload("res://addons/godot_mcp_tool/capture/camera_views.gd")
const GodotMcpCommandError := preload("res://addons/godot_mcp_tool/commands/command_error.gd")
const GodotMcpJsonRpc := preload("res://addons/godot_mcp_tool/bridge/json_rpc.gd")
const GodotMcpViewMarkers := preload("res://addons/godot_mcp_tool/capture/view_markers.gd")
const GodotMcpViewRequests := preload("res://addons/godot_mcp_tool/capture/view_requests.gd")

const CELL := Vector2i(320, 180)
const CRATE_BOUNDS := {
	"Crates/Crate1": AABB(Vector3(-0.5, 0, -0.5), Vector3(1, 1, 1)),
	"Crates/Crate2": AABB(Vector3(2.5, 0, -0.5), Vector3(1, 1, 1)),
	"Crates/Crate3": AABB(Vector3(-0.5, 0, 19.5), Vector3(1, 1, 1)),
}


func _front_view() -> Dictionary:
	return {"label": "front", "transform": GodotMcpCameraViews.looking(Vector3(0, 0.5, 10), Vector3(0, 0.5, 0)), "fov": 50.0}


func _bounds_of(path: String) -> Variant:
	if CRATE_BOUNDS.has(path):
		return CRATE_BOUNDS[path]
	return GodotMcpCommandError.new(GodotMcpJsonRpc.NOT_FOUND, "Node \"%s\" not found" % path, "Similar: Crates/Crate1.")


func _children_of(target: String) -> Variant:
	if target == "Crates":
		return CRATE_BOUNDS.keys()
	return GodotMcpCommandError.new(GodotMcpJsonRpc.NOT_FOUND, "Node \"%s\" not found" % target)


func _engine_projection(view: Dictionary, point: Vector3) -> Vector2:
	var viewport := SubViewport.new()
	viewport.size = CELL
	var camera := Camera3D.new()
	camera.fov = view["fov"]
	if view.has("orthogonal_size"):
		camera.projection = Camera3D.PROJECTION_ORTHOGONAL
		camera.size = view["orthogonal_size"]
	viewport.add_child(camera)
	add_child_autofree(viewport)
	camera.global_transform = view["transform"]
	return camera.unproject_position(point)


func test_reads_node_paths_or_the_children_of_the_target() -> void:
	assert_eq(GodotMcpViewMarkers.request_of({}), [])
	assert_eq(GodotMcpViewMarkers.request_of({"markers": ["Crates/Crate1", "Crates/Crate2"]}), ["Crates/Crate1", "Crates/Crate2"])
	assert_eq(GodotMcpViewMarkers.request_of({"markers": "children", "target": "Crates"}), GodotMcpViewMarkers.CHILDREN)


func test_refuses_markers_it_cannot_read() -> void:
	assert_string_contains(str(GodotMcpViewMarkers.request_of({"markers": "children"})), "give a target")
	var thirteen := range(13).map(func(index: int) -> String: return "Crate%d" % index)
	assert_string_contains(str(GodotMcpViewMarkers.request_of({"markers": thirteen})), "up to 12")
	assert_string_contains(str(GodotMcpViewMarkers.request_of({"markers": []})), "up to 12")
	assert_string_contains(str(GodotMcpViewMarkers.request_of({"markers": [3]})), "node paths")


func test_projects_a_point_where_the_engine_camera_does() -> void:
	var view := _front_view()
	for point in [Vector3(0, 0.5, 0), Vector3(1.5, 0.2, 0), Vector3(-2, 1.5, -3)]:
		var projected: Variant = GodotMcpViewMarkers.project(view, CELL, point)
		assert_true(projected is Vector2, "%s lands in the frame" % point)
		assert_almost_eq(projected as Vector2, _engine_projection(view, point), Vector2(0.01, 0.01))


func test_projects_an_orthogonal_view_as_the_engine_camera_does() -> void:
	var view := _front_view()
	view["orthogonal_size"] = 6.0
	var point := Vector3(2, 1.5, 0)
	assert_almost_eq(GodotMcpViewMarkers.project(view, CELL, point) as Vector2, _engine_projection(view, point), Vector2(0.01, 0.01))


func test_tells_a_point_behind_the_camera_from_one_outside_the_frame() -> void:
	var view := _front_view()
	assert_eq(GodotMcpViewMarkers.project(view, CELL, Vector3(0, 0.5, 20)), GodotMcpViewMarkers.BEHIND)
	assert_eq(GodotMcpViewMarkers.project(view, CELL, Vector3(40, 0.5, 0)), GodotMcpViewMarkers.OUTSIDE)


func test_resolves_the_centers_of_the_marked_nodes() -> void:
	var views: Array = [_front_view(), _front_view()]
	views[0]["marker_request"] = ["Crates/Crate2"]
	views[1]["marker_request"] = GodotMcpViewMarkers.CHILDREN
	views[1]["marker_target"] = "Crates"
	assert_null(GodotMcpViewMarkers.resolve(views, _bounds_of, _children_of))
	assert_eq(views[0]["markers"], [{"path": "Crates/Crate2", "center": Vector3(3, 0.5, 0)}])
	assert_eq((views[1]["markers"] as Array).map(func(marker: Dictionary) -> String: return marker["path"]), ["Crates/Crate1", "Crates/Crate2", "Crates/Crate3"])


func test_names_a_marked_node_that_does_not_exist() -> void:
	var views: Array = [_front_view()]
	views[0]["marker_request"] = ["Crates/Crate9"]
	var error: Variant = GodotMcpViewMarkers.resolve(views, _bounds_of, _children_of)
	assert_true(error is GodotMcpCommandError)
	assert_string_contains((error as GodotMcpCommandError).message, "Crates/Crate9")


func test_marks_at_most_twelve_children_and_counts_the_rest() -> void:
	var many := {}
	for index in 15:
		many["Row/Crate%d" % index] = AABB(Vector3(index, 0, 0), Vector3.ONE)
	var views: Array = [_front_view()]
	views[0]["marker_request"] = GodotMcpViewMarkers.CHILDREN
	views[0]["marker_target"] = "Row"
	GodotMcpViewMarkers.resolve(views, func(path: String) -> Variant: return many[path], func(_target: String) -> Variant: return many.keys())
	assert_eq((views[0]["markers"] as Array).size(), GodotMcpViewMarkers.MAXIMUM_MARKERS)
	assert_eq(views[0]["markers_left_out"], 3)


func test_numbers_the_markers_and_places_them_in_the_cell() -> void:
	var views: Array = [_front_view()]
	views[0]["markers"] = [{"path": "Crates/Crate1", "center": Vector3(0, 0.5, 0)}, {"path": "Crates/Crate3", "center": Vector3(0, 0.5, 20)}]
	GodotMcpViewMarkers.place(views, CELL)
	var places: Array = views[0]["marker_places"]
	assert_eq(places[0]["number"], 1)
	assert_almost_eq(places[0]["pixel"] as Vector2, Vector2(160, 90), Vector2(0.01, 0.01))
	assert_eq(places[1], {"number": 2, "path": "Crates/Crate3", "not_in_view": GodotMcpViewMarkers.BEHIND})


func test_lists_the_markers_by_view_in_pixels_of_the_final_picture() -> void:
	var views: Array = [_front_view(), _front_view()]
	views[1]["label"] = "front again"
	views[1]["markers"] = [{"path": "Crates/Crate1", "center": Vector3(0, 0.5, 0)}]
	views[1]["markers_left_out"] = 2
	GodotMcpViewMarkers.place(views, CELL)
	var legend := GodotMcpViewMarkers.legend(views, CELL, 0.5)
	var column_offset := CELL.x + GodotMcpViewRequests.SHEET_GAP
	assert_eq(legend, [{"view": "front again", "marks": [{"number": 1, "path": "Crates/Crate1", "position": [roundi((column_offset + 160) * 0.5), roundi(90 * 0.5)]}], "left_out": 2}])


func test_reads_the_markers_of_each_view_from_its_description() -> void:
	var descriptions: Array = ["iso", {"preset": "front", "target": "Crates", "markers": "children"}]
	var views: Array = [_front_view(), _front_view()]
	assert_null(GodotMcpViewMarkers.read(views, descriptions, _bounds_of, _children_of))
	assert_false(views[0].has("markers"))
	assert_eq((views[1]["markers"] as Array).size(), 3)


func test_names_the_view_whose_markers_it_cannot_read() -> void:
	var views: Array = [_front_view(), _front_view()]
	var error: Variant = GodotMcpViewMarkers.read(views, ["iso", {"preset": "front", "markers": "children"}], _bounds_of, _children_of)
	assert_true(error is GodotMcpCommandError)
	assert_eq((error as GodotMcpCommandError).code, GodotMcpJsonRpc.INVALID_PARAMS)
	assert_string_contains((error as GodotMcpCommandError).message, "View 2: markers \"children\" marks the children of target")


func test_refuses_children_when_the_target_has_no_3d_children() -> void:
	var views: Array = [_front_view()]
	var error: Variant = GodotMcpViewMarkers.read(views, [{"preset": "front", "target": "Crates", "markers": "children"}], _bounds_of, func(_target: String) -> Variant: return [])
	assert_true(error is GodotMcpCommandError)
	assert_string_contains((error as GodotMcpCommandError).message, "\"Crates\" has no 3D children to mark")


func test_lists_the_markers_of_a_saved_capture_in_its_pixels() -> void:
	var views: Array = [_front_view()]
	views[0]["markers"] = [{"path": "Crates/Crate1", "center": Vector3(0, 0.5, 0)}]
	var cell := GodotMcpViewRequests.cell_size_for(1, 1280)
	GodotMcpViewMarkers.place(views, cell)
	var legend := GodotMcpViewMarkers.legend_of_capture(views, 1280, {"width": 640, "original_width": 1280})
	assert_eq(legend[0]["marks"][0]["position"], [roundi(cell.x / 2.0 * 0.5), roundi(cell.y / 2.0 * 0.5)])
