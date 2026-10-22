extends GutTest

const CommandError := preload("res://addons/godot_mcp_tool/commands/command_error.gd")
const JsonRpc := preload("res://addons/godot_mcp_tool/bridge/json_rpc.gd")
const ViewRequests := preload("res://addons/godot_mcp_tool/capture/view_requests.gd")

const SCENE_BOUNDS := AABB(Vector3(-10, 0, -10), Vector3(20, 2, 20))
const PLAYER_BOUNDS := AABB(Vector3(-0.5, 0, -0.5), Vector3(1, 2, 1))


func _bounds_of(target: String) -> Variant:
	match target:
		"":
			return SCENE_BOUNDS
		"Player":
			return PLAYER_BOUNDS
	return CommandError.new(JsonRpc.NOT_FOUND, "Node \"%s\" not found" % target, "Similar: Player.")


func test_reads_a_preset_name_framed_on_the_whole_scene() -> void:
	var views: Array = ViewRequests.parse(["iso"], _bounds_of)
	assert_eq((views[0] as Dictionary)["label"], "iso")
	assert_eq(((views[0] as Dictionary)["transform"] as Transform3D).origin.y > SCENE_BOUNDS.get_center().y, true)
	assert_eq((views[0] as Dictionary)["fov"], ViewRequests.DEFAULT_FOV)


func test_reads_a_preset_framed_on_a_node() -> void:
	var views: Array = ViewRequests.parse([{"preset": "front", "target": "Player"}], _bounds_of)
	var view: Dictionary = views[0]
	assert_eq(view["label"], "front of Player")
	assert_lt((view["transform"] as Transform3D).origin.distance_to(PLAYER_BOUNDS.get_center()), 10.0)


func test_reads_an_explicit_camera() -> void:
	var views: Array = ViewRequests.parse([{"position": [0, 10, 10], "look_at": [0, 0, 0], "fov": 40, "label": "overview"}], _bounds_of)
	var view: Dictionary = views[0]
	assert_eq(view["label"], "overview")
	assert_eq(view["fov"], 40.0)
	assert_eq((view["transform"] as Transform3D).origin, Vector3(0, 10, 10))


func test_names_an_explicit_camera_by_its_position() -> void:
	var views: Array = ViewRequests.parse([{"position": [0, 10, 10], "look_at": [0, 0, 0]}], _bounds_of)
	assert_eq((views[0] as Dictionary)["label"], "from (0, 10, 10)")


func test_explains_an_unknown_preset() -> void:
	var outcome: Variant = ViewRequests.parse(["diagonal"], _bounds_of)
	assert_true(outcome is CommandError)
	assert_string_contains((outcome as CommandError).message, "View 1")
	assert_string_contains((outcome as CommandError).hint, "front, back, left, right, top, iso")


func test_passes_on_a_target_that_is_not_found() -> void:
	var outcome: Variant = ViewRequests.parse([{"preset": "top", "target": "Playr"}], _bounds_of)
	assert_true(outcome is CommandError)
	assert_eq((outcome as CommandError).code, JsonRpc.NOT_FOUND)


func test_limits_the_number_of_views() -> void:
	assert_true(ViewRequests.parse(["front", "back", "left", "right", "top", "iso", "front"], _bounds_of) is CommandError)


func test_picks_a_grid_for_the_views() -> void:
	assert_eq(ViewRequests.columns_for(1), 1)
	assert_eq(ViewRequests.columns_for(2), 2)
	assert_eq(ViewRequests.columns_for(4), 2)
	assert_eq(ViewRequests.columns_for(6), 3)


func test_looks_at_the_target_without_look_at() -> void:
	var views: Array = ViewRequests.parse([{"position": [0, 5, 5], "target": "Player"}], _bounds_of)
	var forward := -((views[0] as Dictionary)["transform"] as Transform3D).basis.z
	assert_almost_eq(forward, (PLAYER_BOUNDS.get_center() - Vector3(0, 5, 5)).normalized(), Vector3.ONE * 0.001)


func test_explains_a_field_of_view_out_of_range() -> void:
	var outcome: Variant = ViewRequests.parse([{"preset": "iso", "fov": 200}], _bounds_of)
	assert_true(outcome is CommandError)
	assert_string_contains((outcome as CommandError).message, "fov")


func test_explains_a_camera_that_looks_at_itself() -> void:
	var outcome: Variant = ViewRequests.parse([{"position": [1, 2, 3], "look_at": [1, 2, 3]}], _bounds_of)
	assert_true(outcome is CommandError)
	assert_string_contains((outcome as CommandError).message, "View 1")


func test_sizes_the_cells_so_that_the_sheet_fits_the_longest_side() -> void:
	assert_eq(ViewRequests.cell_size_for(1, 1280), Vector2i(1280, 720))
	assert_eq(ViewRequests.cell_size_for(4, 1280), Vector2i(636, 358))
	assert_eq(ViewRequests.cell_size_for(6, 1280), Vector2i(421, 237))


func test_lists_the_labels_of_the_views() -> void:
	var views: Array = ViewRequests.parse(["iso", {"preset": "top", "target": "Player"}], _bounds_of)
	assert_eq(ViewRequests.labels_of(views), ["iso", "top of Player"])
