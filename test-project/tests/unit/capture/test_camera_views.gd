extends GutTest

const CameraViews := preload("res://addons/godot_mcp_tool/capture/camera_views.gd")

const BOX := AABB(Vector3(-1, 0, -1), Vector3(2, 2, 2))


func _looks_at(transform: Transform3D, target: Vector3) -> bool:
	var forward := -transform.basis.z
	return forward.normalized().dot((target - transform.origin).normalized()) > 0.999


func test_places_the_front_view_on_the_positive_z_side_looking_at_the_center() -> void:
	var view: Transform3D = CameraViews.preset("front", BOX, 50.0)
	assert_gt(view.origin.z, BOX.get_center().z)
	assert_almost_eq(view.origin.x, 0.0, 0.001)
	assert_true(_looks_at(view, BOX.get_center()))


func test_places_the_top_view_above_the_center() -> void:
	var view: Transform3D = CameraViews.preset("top", BOX, 50.0)
	assert_gt(view.origin.y, BOX.end.y)
	assert_true(_looks_at(view, BOX.get_center()))


func test_places_the_iso_view_up_and_to_the_side() -> void:
	var view: Transform3D = CameraViews.preset("iso", BOX, 50.0)
	assert_gt(view.origin.x, 0.0)
	assert_gt(view.origin.y, BOX.get_center().y)
	assert_gt(view.origin.z, 0.0)
	assert_true(_looks_at(view, BOX.get_center()))


func test_keeps_the_whole_box_in_view() -> void:
	var view: Transform3D = CameraViews.preset("left", BOX, 50.0)
	var distance := view.origin.distance_to(BOX.get_center())
	assert_gte(distance, BOX.size.length() / 2.0 / sin(deg_to_rad(25.0)))


func test_frames_an_empty_box_from_a_short_distance() -> void:
	var view: Transform3D = CameraViews.preset("front", AABB(Vector3(3, 0, 0), Vector3.ZERO), 50.0)
	assert_gt(view.origin.distance_to(Vector3(3, 0, 0)), 0.5)
	assert_lt(view.origin.distance_to(Vector3(3, 0, 0)), 10.0)


func test_looks_from_a_position_at_a_point() -> void:
	var view: Transform3D = CameraViews.looking(Vector3(0, 10, 10), Vector3.ZERO)
	assert_eq(view.origin, Vector3(0, 10, 10))
	assert_true(_looks_at(view, Vector3.ZERO))


func test_looks_straight_down_without_breaking() -> void:
	var view: Transform3D = CameraViews.looking(Vector3(0, 10, 0), Vector3.ZERO)
	assert_true(_looks_at(view, Vector3.ZERO))


func test_lists_its_presets() -> void:
	assert_eq(CameraViews.PRESETS, ["front", "back", "left", "right", "top", "iso"])
