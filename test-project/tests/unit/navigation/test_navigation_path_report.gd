extends GutTest

const GodotMcpNavigationPathReport := preload("res://addons/godot_mcp_tool/navigation/navigation_path_report.gd")
const GodotMcpVariantCodec := preload("res://addons/godot_mcp_tool/codec/variant_codec.gd")

var _codec := GodotMcpVariantCodec.new()


func _report(path: PackedVector3Array, target_on_mesh: Vector3, start_on_mesh: Vector3 = Vector3(-9, 0.5, 0)) -> Dictionary:
	return GodotMcpNavigationPathReport.describe(path, Vector3(-9, 0, 0), Vector3(10, 0, 0), start_on_mesh, target_on_mesh, _codec)


func test_says_that_a_path_reaches_the_target_and_measures_it() -> void:
	var report := _report(PackedVector3Array([Vector3(-9, 0.5, 0), Vector3(0, 0.5, 0), Vector3(10, 0.5, 0)]), Vector3(10, 0.5, 0))
	assert_eq(report["reached"], true)
	assert_almost_eq(float(report["length"]), 19.0, 0.001)
	assert_eq(report["point_count"], 3)
	assert_eq(report["points"], ["Vector3(-9, 0.5, 0)", "Vector3(0, 0.5, 0)", "Vector3(10, 0.5, 0)"])
	assert_eq(report["end"], "Vector3(10, 0.5, 0)")


func test_says_where_a_path_stops_short_of_the_target() -> void:
	var report := _report(PackedVector3Array([Vector3(-9, 0.5, 0), Vector3(-6, 0.5, 0), Vector3(-1.5, 0.5, 0)]), Vector3(10, 0.5, 0))
	assert_eq(report["reached"], false)
	assert_almost_eq(float(report["short_by"]), 11.5, 0.001)
	assert_eq(report["end"], "Vector3(-1.5, 0.5, 0)")


func test_keeps_the_first_and_the_last_points_of_a_long_path() -> void:
	var path := PackedVector3Array()
	for index in 30:
		path.append(Vector3(index, 0.5, 0))
	var report := _report(path, Vector3(29, 0.5, 0))
	assert_eq(report["point_count"], 30)
	assert_eq((report["points"] as Array).size(), 10)
	assert_eq((report["points"] as Array)[0], "Vector3(0, 0.5, 0)")
	assert_eq((report["points"] as Array)[9], "Vector3(29, 0.5, 0)")
	assert_eq(report["points_left_out"], 20)


func test_says_how_far_the_ends_lie_from_the_navigation_mesh() -> void:
	var report := _report(PackedVector3Array([Vector3(-9, 0.5, 0), Vector3(10, 0.5, 0)]), Vector3(10, 0.5, 4), Vector3(-9, 0.5, 3))
	assert_almost_eq(float(report["start_off_mesh"]), sqrt(9.25), 0.001)
	assert_almost_eq(float(report["target_off_mesh"]), sqrt(16.25), 0.001)


func test_rounds_the_points_it_shows_to_millimeters() -> void:
	var report := _report(PackedVector3Array([Vector3(-2.3841858e-07, 0.5, -6), Vector3(1.23456, 0.5, 2)]), Vector3(1.23456, 0.5, 2))
	assert_eq(report["points"], ["Vector3(0, 0.5, -6)", "Vector3(1.235, 0.5, 2)"])


func test_reports_an_empty_path() -> void:
	var report := _report(PackedVector3Array(), Vector3.ZERO)
	assert_eq(report["reached"], false)
	assert_eq(report["point_count"], 0)
	assert_eq(report["length"], 0.0)
	assert_false(report.has("end"))
