extends GutTest

const CaptureStore := preload("res://addons/godot_mcp_tool/capture/capture_store.gd")

var _directory := ""


func before_each() -> void:
	_directory = OS.get_user_data_dir().path_join("mcp_capture_test_%d" % Time.get_ticks_usec())


func after_each() -> void:
	if not DirAccess.dir_exists_absolute(_directory):
		return
	for file_name in DirAccess.get_files_at(_directory):
		DirAccess.remove_absolute(_directory.path_join(file_name))
	DirAccess.remove_absolute(_directory)


func _image() -> Image:
	var image := Image.create_empty(64, 32, false, Image.FORMAT_RGBA8)
	image.fill(Color.ORANGE)
	return image


func test_saves_a_png_with_a_prefix() -> void:
	var path: String = CaptureStore.new(_directory).save(_image(), "game", "png")
	assert_true(path.begins_with(_directory.path_join("game-")))
	assert_true(path.ends_with(".png"))
	assert_eq(Image.load_from_file(path).get_size(), Vector2i(64, 32))


func test_saves_a_jpeg() -> void:
	var path: String = CaptureStore.new(_directory).save(_image(), "editor", "jpeg")
	assert_true(path.ends_with(".jpg"))
	assert_true(FileAccess.file_exists(path))


func test_keeps_only_the_latest_captures() -> void:
	var store := CaptureStore.new(_directory, 3)
	for index in 5:
		store.save(_image(), "game", "png")
	assert_eq(DirAccess.get_files_at(_directory).size(), 3)


func test_refuses_an_unknown_format() -> void:
	var outcome: Variant = CaptureStore.new(_directory).save(_image(), "game", "gif")
	assert_true(outcome is int)
