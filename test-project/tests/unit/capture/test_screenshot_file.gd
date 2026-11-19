extends GutTest

const GodotMcpCaptureStore := preload("res://addons/godot_mcp_tool/capture/capture_store.gd")
const GodotMcpCommandError := preload("res://addons/godot_mcp_tool/commands/command_error.gd")
const GodotMcpJsonRpc := preload("res://addons/godot_mcp_tool/bridge/json_rpc.gd")
const GodotMcpScreenshotFile := preload("res://addons/godot_mcp_tool/capture/screenshot_file.gd")

var _directory := ""


func before_each() -> void:
	_directory = OS.get_user_data_dir().path_join("mcp_screenshot_test_%d" % Time.get_ticks_usec())


func after_each() -> void:
	if not DirAccess.dir_exists_absolute(_directory):
		return
	for file_name in DirAccess.get_files_at(_directory):
		DirAccess.remove_absolute(_directory.path_join(file_name))
	DirAccess.remove_absolute(_directory)


func _image(width: int, height: int) -> Image:
	var image := Image.create_empty(width, height, false, Image.FORMAT_RGBA8)
	image.fill(Color.STEEL_BLUE)
	return image


func test_saves_the_fitted_image_and_reports_its_size() -> void:
	var saved: Dictionary = GodotMcpScreenshotFile.write(_image(2560, 1440), {"max_size": 1280, "format": "png"}, GodotMcpCaptureStore.new(_directory), "game")
	assert_true(FileAccess.file_exists(saved["path"]))
	assert_eq(Image.load_from_file(saved["path"]).get_size(), Vector2i(1280, 720))
	assert_eq([saved["width"], saved["height"]], [1280, 720])
	assert_eq([saved["original_width"], saved["original_height"]], [2560, 1440])


func test_reports_an_absolute_path() -> void:
	var saved: Dictionary = GodotMcpScreenshotFile.write(_image(64, 32), {"max_size": 1280, "format": "jpeg"}, GodotMcpCaptureStore.new(_directory), "editor")
	assert_true((saved["path"] as String).is_absolute_path())
	assert_false((saved["path"] as String).begins_with("user://"))


func test_explains_an_empty_render() -> void:
	var error: Variant = GodotMcpScreenshotFile.write(Image.new(), {"max_size": 1280, "format": "png"}, GodotMcpCaptureStore.new(_directory), "game")
	assert_true(error is GodotMcpCommandError)
	assert_eq((error as GodotMcpCommandError).code, GodotMcpJsonRpc.OPERATION_FAILED)


func test_explains_a_failed_save() -> void:
	var error: Variant = GodotMcpScreenshotFile.write(_image(64, 32), {"max_size": 1280, "format": "gif"}, GodotMcpCaptureStore.new(_directory), "game")
	assert_true(error is GodotMcpCommandError)
	assert_string_contains((error as GodotMcpCommandError).message, "Could not save")


func test_compares_the_image_with_an_earlier_one_and_outlines_the_change() -> void:
	var store := GodotMcpCaptureStore.new(ProjectSettings.globalize_path("res://.godot/godot_mcp_tool/test_captures_%d" % Time.get_ticks_usec()))
	var earlier: Dictionary = GodotMcpScreenshotFile.write(_image(320, 180), {"max_size": 1280, "format": "png", "compare_to": "", "tolerance": 0.1}, store, "game")
	var changed := _image(320, 180)
	changed.fill_rect(Rect2i(200, 100, 40, 40), Color.YELLOW)
	var saved: Dictionary = GodotMcpScreenshotFile.write(changed, {"max_size": 1280, "format": "png", "compare_to": earlier["path"], "tolerance": 0.1}, store, "game")
	var comparison: Dictionary = saved["comparison"]
	var outlined := Image.load_from_file(saved["path"])
	for file_name in DirAccess.get_files_at(store.directory):
		DirAccess.remove_absolute(store.directory.path_join(file_name))
	DirAccess.remove_absolute(store.directory)
	assert_eq(comparison["earlier"], earlier["path"])
	assert_eq(comparison["sizes_match"], true)
	assert_almost_eq(float((comparison["changed_rect"] as Array)[0]), 200.0, 3.0)
	assert_eq(outlined.get_pixel(198, 120), Color(1, 0, 1))


func test_refuses_to_compare_with_an_image_it_cannot_read() -> void:
	var refused: Variant = GodotMcpScreenshotFile.write(_image(64, 32), {"max_size": 1280, "format": "png", "compare_to": "res://missing_capture.png", "tolerance": 0.1}, GodotMcpCaptureStore.new(_directory), "game")
	assert_true(refused is GodotMcpCommandError)
	assert_eq((refused as GodotMcpCommandError).code, GodotMcpJsonRpc.INVALID_PARAMS)
