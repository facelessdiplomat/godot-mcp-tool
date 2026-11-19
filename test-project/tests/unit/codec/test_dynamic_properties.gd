extends GutTest

const GodotMcpPlainUndoHistory := preload("res://addons/godot_mcp_tool/scene/plain_undo_history.gd")
const GodotMcpPropertyEditor := preload("res://addons/godot_mcp_tool/scene/property_editor.gd")
const GodotMcpVariantCodec := preload("res://addons/godot_mcp_tool/codec/variant_codec.gd")

var _editor: GodotMcpPropertyEditor
var _history: GodotMcpPlainUndoHistory


func before_each() -> void:
	_editor = GodotMcpPropertyEditor.new(GodotMcpVariantCodec.new())
	_history = GodotMcpPlainUndoHistory.new()


func after_each() -> void:
	_history.dispose()


func test_sets_the_items_of_a_theme_by_type_kind_and_name() -> void:
	var theme := Theme.new()
	var report := _editor.assign(theme, {
		"Button/styles/normal": {"new": "StyleBoxFlat", "bg_color": "#20232a", "corner_radius_top_left": 8},
		"Button/font_sizes/font_size": 24,
		"Button/colors/font_color": "white",
		"Label/constants/outline_size": 2,
	})
	assert_eq(report["rejected"], [])
	assert_eq(report["applied"], ["Button/styles/normal", "Button/font_sizes/font_size", "Button/colors/font_color", "Label/constants/outline_size"])
	assert_true(theme.get_stylebox("normal", "Button") is StyleBoxFlat)
	assert_eq((theme.get_stylebox("normal", "Button") as StyleBoxFlat).corner_radius_top_left, 8)
	assert_eq(theme.get_font_size("font_size", "Button"), 24)
	assert_eq(theme.get_color("font_color", "Button"), Color.WHITE)


func test_names_the_kinds_of_theme_items_when_one_is_unknown() -> void:
	var report := _editor.assign(Theme.new(), {"Button/sizes/font_size": 24})
	assert_eq(report["rejected"].size(), 1)
	assert_string_contains(report["rejected"][0]["reason"], "colors, constants, fonts, font_sizes, icons, styles")


func test_sets_the_points_of_a_curve_after_their_count() -> void:
	var curve := Curve3D.new()
	var report := _editor.assign(curve, {
		"point_0/position": [-8, 0.5, -8],
		"point_1/position": [8, 0.5, -8],
		"point_2/position": [8, 0.5, 8],
		"point_count": 3,
		"closed": true,
	})
	assert_eq(report["rejected"], [])
	assert_eq(curve.point_count, 3)
	assert_eq(curve.get_point_position(1), Vector3(8, 0.5, -8))
	assert_true(curve.closed)


func test_explains_a_point_beyond_the_count_of_a_curve() -> void:
	var report := _editor.assign(Curve3D.new(), {"point_2/position": [1, 0, 0]})
	assert_eq(report["rejected"].size(), 1)
	assert_string_contains(report["rejected"][0]["reason"], "point_count")


func test_creates_a_curve_with_its_points_inside_a_node_property() -> void:
	var path: Path3D = autofree(Path3D.new())
	var report := _editor.apply(path, {"curve": {"new": "Curve3D", "point_count": 2, "point_0/position": [0, 0, 0], "point_1/position": [5, 0, 0]}}, _history, "MCP: Set properties", path)
	assert_eq(report["rejected"], [])
	assert_eq(path.curve.point_count, 2)
	assert_eq(path.curve.get_point_position(1), Vector3(5, 0, 0))


func test_sets_the_items_of_a_mesh_library_by_their_ids() -> void:
	var library := MeshLibrary.new()
	var report := _editor.assign(library, {"item/0/name": "Grass", "item/0/mesh": {"new": "BoxMesh", "size": [2, 0.5, 2]}, "item/3/name": "Stone"})
	assert_eq(report["rejected"], [])
	assert_eq(library.get_item_name(0), "Grass")
	assert_true(library.get_item_mesh(0) is BoxMesh)
	assert_eq(library.get_item_name(3), "Stone")


func test_still_rejects_names_that_no_object_takes() -> void:
	var report := _editor.assign(Curve3D.new(), {"points/0": [0, 0, 0]})
	assert_eq(report["rejected"].size(), 1)
	assert_string_contains(report["rejected"][0]["reason"], "Curve3D has no property \"points/0\"")
