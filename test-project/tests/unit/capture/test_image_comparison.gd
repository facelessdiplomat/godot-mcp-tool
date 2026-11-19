extends GutTest

const GodotMcpImageComparison := preload("res://addons/godot_mcp_tool/capture/image_comparison.gd")

const GRAY := Color(0.5, 0.5, 0.5)


func _image(width: int, height: int, color: Color) -> Image:
	var image := Image.create(width, height, false, Image.FORMAT_RGB8)
	image.fill(color)
	return image


func test_finds_no_change_between_equal_images() -> void:
	var comparison := GodotMcpImageComparison.compare(_image(320, 180, GRAY), _image(320, 180, GRAY), 0.1)
	assert_eq(comparison["sizes_match"], true)
	assert_eq(comparison["changed_share"], 0.0)
	assert_eq(comparison["changed_rect"], null)
	assert_almost_eq(float(comparison["mean_difference"]), 0.0, 0.001)


func test_finds_the_rectangle_of_a_changed_block() -> void:
	var current := _image(320, 180, GRAY)
	current.fill_rect(Rect2i(100, 40, 60, 50), Color.RED)
	var comparison := GodotMcpImageComparison.compare(current, _image(320, 180, GRAY), 0.1)
	var rect: Array = comparison["changed_rect"]
	assert_almost_eq(float(rect[0]), 100.0, 3.0)
	assert_almost_eq(float(rect[1]), 40.0, 3.0)
	assert_almost_eq(float(rect[2]), 60.0, 4.0)
	assert_almost_eq(float(rect[3]), 50.0, 4.0)
	assert_almost_eq(float(comparison["changed_share"]), 3000.0 / 57600.0, 0.01)
	assert_gt(float(comparison["mean_difference"]), 0.0)


func test_ignores_changes_within_the_tolerance() -> void:
	var current := _image(320, 180, Color(0.52, 0.5, 0.5))
	var comparison := GodotMcpImageComparison.compare(current, _image(320, 180, GRAY), 0.1)
	assert_eq(comparison["changed_share"], 0.0)
	assert_eq(comparison["changed_rect"], null)


func test_compares_images_of_different_sizes_after_scaling_the_earlier_one() -> void:
	var comparison := GodotMcpImageComparison.compare(_image(320, 180, GRAY), _image(640, 360, GRAY), 0.1)
	assert_eq(comparison["sizes_match"], false)
	assert_eq(comparison["earlier_size"], [640, 360])
	assert_eq(comparison["changed_share"], 0.0)


func test_outlines_the_changes_around_their_rectangle() -> void:
	var image := _image(320, 180, GRAY)
	var inside := image.get_pixel(130, 65)
	GodotMcpImageComparison.outline(image, [100, 40, 60, 50])
	assert_eq(image.get_pixel(99, 60), GodotMcpImageComparison.OUTLINE_COLOR)
	assert_eq(image.get_pixel(161, 60), GodotMcpImageComparison.OUTLINE_COLOR)
	assert_eq(image.get_pixel(130, 65), inside)


func test_reads_an_earlier_capture_and_refuses_a_file_outside_the_project() -> void:
	var folder := ProjectSettings.globalize_path("user://comparison")
	DirAccess.make_dir_recursive_absolute(folder)
	_image(32, 18, GRAY).save_png(folder.path_join("earlier.png"))
	var outside: Variant = GodotMcpImageComparison.load_earlier(folder.path_join("earlier.png"))
	var missing: Variant = GodotMcpImageComparison.load_earlier("res://no_such_capture.png")
	DirAccess.remove_absolute(folder.path_join("earlier.png"))
	assert_true(outside is String)
	assert_string_contains(outside, "inside the project")
	assert_true(missing is String)
	assert_string_contains(missing, "no_such_capture.png")


func test_reads_an_image_of_the_project() -> void:
	var path := "res://tests/fixtures/comparison_baseline.png"
	_image(32, 18, GRAY).save_png(ProjectSettings.globalize_path(path))
	var earlier: Variant = GodotMcpImageComparison.load_earlier(path)
	DirAccess.remove_absolute(ProjectSettings.globalize_path(path))
	assert_true(earlier is Image)
	assert_eq((earlier as Image).get_size(), Vector2i(32, 18))
