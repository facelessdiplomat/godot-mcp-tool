extends GutTest

const CaptureStore := preload("res://addons/godot_mcp_tool/capture/capture_store.gd")
const CommandError := preload("res://addons/godot_mcp_tool/commands/command_error.gd")
const JsonRpc := preload("res://addons/godot_mcp_tool/bridge/json_rpc.gd")
const ScreenshotFile := preload("res://addons/godot_mcp_tool/capture/screenshot_file.gd")

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
	var saved: Dictionary = ScreenshotFile.write(_image(2560, 1440), {"max_size": 1280, "format": "png"}, CaptureStore.new(_directory), "game")
	assert_true(FileAccess.file_exists(saved["path"]))
	assert_eq(Image.load_from_file(saved["path"]).get_size(), Vector2i(1280, 720))
	assert_eq([saved["width"], saved["height"]], [1280, 720])
	assert_eq([saved["original_width"], saved["original_height"]], [2560, 1440])


func test_reports_an_absolute_path() -> void:
	var saved: Dictionary = ScreenshotFile.write(_image(64, 32), {"max_size": 1280, "format": "jpeg"}, CaptureStore.new(_directory), "editor")
	assert_true((saved["path"] as String).is_absolute_path())
	assert_false((saved["path"] as String).begins_with("user://"))


func test_explains_an_empty_render() -> void:
	var error: Variant = ScreenshotFile.write(Image.new(), {"max_size": 1280, "format": "png"}, CaptureStore.new(_directory), "game")
	assert_true(error is CommandError)
	assert_eq((error as CommandError).code, JsonRpc.OPERATION_FAILED)


func test_explains_a_failed_save() -> void:
	var error: Variant = ScreenshotFile.write(_image(64, 32), {"max_size": 1280, "format": "gif"}, CaptureStore.new(_directory), "game")
	assert_true(error is CommandError)
	assert_string_contains((error as CommandError).message, "Could not save")
