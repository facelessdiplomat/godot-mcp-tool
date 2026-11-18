extends GutTest

const GodotMcpBoundsReport := preload("res://addons/godot_mcp_tool/capture/bounds_report.gd")
const GodotMcpCanvasBounds := preload("res://addons/godot_mcp_tool/capture/canvas_bounds.gd")
const GodotMcpCommandError := preload("res://addons/godot_mcp_tool/commands/command_error.gd")
const GodotMcpVariantCodec := preload("res://addons/godot_mcp_tool/codec/variant_codec.gd")

var _root: Node


func before_each() -> void:
	_root = Node.new()
	add_child(_root)


func after_each() -> void:
	_root.free()


func _added(parent: Node, node: Node) -> Node:
	parent.add_child(node)
	return node


func test_measures_a_control_by_its_rectangle_on_the_canvas() -> void:
	var hud := _added(_root, Control.new()) as Control
	hud.position = Vector2(10, 20)
	var bar := _added(hud, ProgressBar.new()) as ProgressBar
	bar.position = Vector2(100, 50)
	bar.size = Vector2(200, 30)
	var measured := GodotMcpCanvasBounds.measure(bar)
	assert_eq(measured["rect"], Rect2(110, 70, 200, 30))
	assert_eq(measured["visual_count"], 1)


func test_measures_sprites_polygons_and_lines_of_a_2d_subtree() -> void:
	var level := _added(_root, Node2D.new()) as Node2D
	level.position = Vector2(100, 100)
	var texture := PlaceholderTexture2D.new()
	texture.size = Vector2(32, 32)
	var sprite := _added(level, Sprite2D.new()) as Sprite2D
	sprite.texture = texture
	sprite.position = Vector2(50, 0)
	sprite.scale = Vector2(2, 2)
	var polygon := _added(level, Polygon2D.new()) as Polygon2D
	polygon.polygon = PackedVector2Array([Vector2(0, 0), Vector2(40, 0), Vector2(0, 30)])
	var line := _added(level, Line2D.new()) as Line2D
	line.points = PackedVector2Array([Vector2(-20, 0), Vector2(-20, 40)])
	line.width = 10
	var measured := GodotMcpCanvasBounds.measure(level)
	assert_eq(measured["rect"], Rect2(75, 68, 107, 77))
	assert_eq(measured["visual_count"], 3)
	assert_eq(measured["collision_count"], 0)


func test_falls_back_to_collision_shapes_without_visuals() -> void:
	var body := _added(_root, StaticBody2D.new()) as StaticBody2D
	body.position = Vector2(200, 300)
	var rectangle := RectangleShape2D.new()
	rectangle.size = Vector2(40, 20)
	var shape := _added(body, CollisionShape2D.new()) as CollisionShape2D
	shape.shape = rectangle
	var measured := GodotMcpCanvasBounds.measure(body)
	assert_eq(measured["rect"], Rect2(180, 290, 40, 20))
	assert_eq(measured["visual_count"], 0)
	assert_eq(measured["collision_count"], 1)


func test_reports_the_rectangle_and_whether_a_control_fits_the_window() -> void:
	var panel := _added(_root, Panel.new()) as Panel
	panel.position = Vector2(1100, 600)
	panel.size = Vector2(100, 100)
	var report: Dictionary = GodotMcpBoundsReport.describe(panel, GodotMcpVariantCodec.new())
	assert_eq(report["dimensions"], 2)
	assert_eq(report["position"], "Vector2(1100, 600)")
	assert_eq(report["size"], "Vector2(100, 100)")
	assert_eq(report["center"], "Vector2(1150, 650)")
	assert_eq(report["end"], "Vector2(1200, 700)")
	assert_eq(report["window"], "Vector2(1152, 648)")
	assert_false(report["inside_window"])
	panel.position = Vector2(20, 20)
	assert_true(GodotMcpBoundsReport.describe(panel, GodotMcpVariantCodec.new())["inside_window"])


func test_explains_a_node_that_is_neither_3d_nor_2d() -> void:
	var timer := _added(_root, Timer.new())
	var error: GodotMcpCommandError = GodotMcpBoundsReport.describe(timer, GodotMcpVariantCodec.new())
	assert_string_contains(error.message, "neither a 3D nor a 2D node")
