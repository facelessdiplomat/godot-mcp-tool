extends GutTest

const GodotMcpViewRenderer := preload("res://addons/godot_mcp_tool/capture/view_renderer.gd")

const CELL := Vector2i(640, 360)


func test_centers_a_numbered_marker_on_its_point() -> void:
	var marker: Label = autofree(GodotMcpViewRenderer.marker_for(7, Vector2(300, 200), CELL))

	assert_eq(marker.text, "7")
	assert_almost_eq(marker.position + marker.size / 2.0, Vector2(300, 200), Vector2(0.5, 0.5))


func test_keeps_a_marker_near_an_edge_inside_the_view() -> void:
	var marker: Label = autofree(GodotMcpViewRenderer.marker_for(12, Vector2(2, 359), CELL))

	assert_eq(marker.position.x, 0.0)
	assert_almost_eq(marker.position.y + marker.size.y, float(CELL.y), 0.5)


func test_draws_two_digits_wider_than_one() -> void:
	var one: Label = autofree(GodotMcpViewRenderer.marker_for(3, Vector2(100, 100), CELL))
	var two: Label = autofree(GodotMcpViewRenderer.marker_for(11, Vector2(100, 100), CELL))

	assert_gt(two.size.x, one.size.x)
	assert_eq(two.size.y, one.size.y)
