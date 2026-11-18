extends GutTest

const GodotMcpWindowSizeOverride := preload("res://addons/godot_mcp_tool/runtime/window_size_override.gd")

const FOLDER := "user://window_size_override_test"
const OVERRIDE_FILE := FOLDER + "/override.cfg"
const RECORD_FILE := FOLDER + "/override_before_run.json"
const WIDTH_KEY := "window/size/window_width_override"
const HEIGHT_KEY := "window/size/window_height_override"

var _override: GodotMcpWindowSizeOverride


func before_each() -> void:
	DirAccess.make_dir_recursive_absolute(FOLDER)
	_remove(OVERRIDE_FILE)
	_remove(RECORD_FILE)
	_override = GodotMcpWindowSizeOverride.new(OVERRIDE_FILE, RECORD_FILE)


func after_each() -> void:
	_remove(OVERRIDE_FILE)
	_remove(RECORD_FILE)


func _remove(path: String) -> void:
	if FileAccess.file_exists(path):
		DirAccess.remove_absolute(path)


func _written_size() -> Vector2i:
	var config := ConfigFile.new()
	config.load(OVERRIDE_FILE)
	return Vector2i(int(config.get_value("display", WIDTH_KEY, 0)), int(config.get_value("display", HEIGHT_KEY, 0)))


func test_asks_for_the_window_size_in_an_override_file_and_removes_it_again() -> void:
	assert_eq(_override.apply(Vector2i(1024, 768)), OK)
	assert_true(_override.is_active())
	assert_eq(_written_size(), Vector2i(1024, 768))
	_override.restore()
	assert_false(_override.is_active())
	assert_false(FileAccess.file_exists(OVERRIDE_FILE))


func test_keeps_the_settings_of_an_override_file_that_was_there_and_puts_it_back_as_it_was() -> void:
	var original := "[display]\n\nwindow/size/mode=0\n\n[audio]\n\nbuses/default_bus_layout=\"res://buses.tres\"\n"
	var file := FileAccess.open(OVERRIDE_FILE, FileAccess.WRITE)
	file.store_string(original)
	file.close()
	_override.apply(Vector2i(1280, 720))
	var config := ConfigFile.new()
	config.load(OVERRIDE_FILE)
	assert_eq(_written_size(), Vector2i(1280, 720))
	assert_eq(config.get_value("audio", "buses/default_bus_layout"), "res://buses.tres")
	_override.restore()
	assert_eq(FileAccess.get_file_as_string(OVERRIDE_FILE), original)


func test_puts_the_file_back_after_an_editor_that_stopped_before_it_could() -> void:
	_override.apply(Vector2i(1024, 768))
	var next_session := GodotMcpWindowSizeOverride.new(OVERRIDE_FILE, RECORD_FILE)
	next_session.restore()
	assert_false(FileAccess.file_exists(OVERRIDE_FILE))
	assert_false(FileAccess.file_exists(RECORD_FILE))


func test_does_nothing_when_nothing_was_asked_for() -> void:
	_override.restore()
	assert_false(_override.is_active())
	assert_false(FileAccess.file_exists(OVERRIDE_FILE))


func test_asks_for_a_new_size_on_top_of_the_original_file_only() -> void:
	_override.apply(Vector2i(1024, 768))
	_override.apply(Vector2i(800, 600))
	assert_eq(_written_size(), Vector2i(800, 600))
	_override.restore()
	assert_false(FileAccess.file_exists(OVERRIDE_FILE))
