extends GutTest

const GodotMcpCanvasSizes := preload("res://addons/godot_mcp_tool/capture/canvas_sizes.gd")
const GodotMcpCommandError := preload("res://addons/godot_mcp_tool/commands/command_error.gd")
const GodotMcpHeadlessWindow := preload("res://addons/godot_mcp_tool/runtime/headless_window.gd")

const BASE := Vector2i(1152, 648)


func test_reads_window_sizes_and_names_their_aspect() -> void:
	assert_eq(GodotMcpCanvasSizes.parse([[1920, 1080], [1440, 1080], [1366, 768]]), [Vector2i(1920, 1080), Vector2i(1440, 1080), Vector2i(1366, 768)])
	assert_eq(GodotMcpCanvasSizes.label_of(Vector2i(1920, 1080)), "1920×1080 (16:9)")
	assert_eq(GodotMcpCanvasSizes.label_of(Vector2i(1440, 1080)), "1440×1080 (4:3)")
	assert_eq(GodotMcpCanvasSizes.label_of(Vector2i(1366, 768)), "1366×768 (1.78:1)")


func test_defaults_to_the_window_of_the_project() -> void:
	assert_eq(GodotMcpCanvasSizes.parse(null), [GodotMcpHeadlessWindow.project_window_size()])


func test_explains_sizes_it_cannot_use() -> void:
	var too_many := []
	too_many.resize(GodotMcpCanvasSizes.MAXIMUM_SIZES + 1)
	too_many.fill([640, 480])
	for unusable in [[], [[0, 100]], [[100]], "big", too_many, [[10000, 10]]]:
		assert_true(GodotMcpCanvasSizes.parse(unusable) is GodotMcpCommandError, "%s" % [unusable])


func test_lays_the_ui_out_like_the_stretch_settings_of_the_project() -> void:
	assert_eq(GodotMcpCanvasSizes.layout_size_for(Vector2i(1920, 1080), BASE, "disabled", "keep"), Vector2i(1920, 1080))
	assert_eq(GodotMcpCanvasSizes.layout_size_for(Vector2i(1920, 1080), BASE, "canvas_items", "expand"), BASE)
	assert_eq(GodotMcpCanvasSizes.layout_size_for(Vector2i(1440, 1080), BASE, "canvas_items", "expand"), Vector2i(1152, 864))
	assert_eq(GodotMcpCanvasSizes.layout_size_for(Vector2i(2560, 1080), BASE, "canvas_items", "expand"), Vector2i(1536, 648))
	assert_eq(GodotMcpCanvasSizes.layout_size_for(Vector2i(1440, 1080), BASE, "canvas_items", "keep"), BASE)
	assert_eq(GodotMcpCanvasSizes.layout_size_for(Vector2i(1440, 1080), BASE, "viewport", "keep_width"), Vector2i(1152, 864))
	assert_eq(GodotMcpCanvasSizes.layout_size_for(Vector2i(1440, 1080), BASE, "viewport", "keep_height"), BASE)
	assert_eq(GodotMcpCanvasSizes.layout_size_for(Vector2i(2560, 1080), BASE, "viewport", "keep_height"), Vector2i(1536, 648))


func test_letterboxes_a_layout_that_keeps_its_aspect() -> void:
	assert_eq(GodotMcpCanvasSizes.content_size_for(Vector2i(1440, 1080), BASE, "keep"), Vector2i(1440, 810))
	assert_eq(GodotMcpCanvasSizes.content_size_for(Vector2i(1440, 1080), Vector2i(1152, 864), "expand"), Vector2i(1440, 1080))
	assert_eq(GodotMcpCanvasSizes.content_size_for(Vector2i(1440, 1080), BASE, "ignore"), Vector2i(1440, 1080))
