extends RefCounted

const PROJECT_OVERRIDE_FILE := "res://override.cfg"
const PROJECT_RECORD_FILE := "res://.godot/godot_mcp_tool/override_before_run.json"
const DISPLAY_SECTION := "display"
const WIDTH_KEY := "window/size/window_width_override"
const HEIGHT_KEY := "window/size/window_height_override"
const EXISTED_KEY := "existed"
const TEXT_KEY := "text"

var _override_file: String
var _record_file: String
var _active := false


func _init(override_file := PROJECT_OVERRIDE_FILE, record_file := PROJECT_RECORD_FILE) -> void:
	_override_file = override_file
	_record_file = record_file


func is_active() -> bool:
	return _active


func apply(size: Vector2i) -> Error:
	restore()
	var existed := FileAccess.file_exists(_override_file)
	var original_text := FileAccess.get_file_as_string(_override_file) if existed else ""
	DirAccess.make_dir_recursive_absolute(_record_file.get_base_dir())
	var record := FileAccess.open(_record_file, FileAccess.WRITE)
	if record == null:
		return FileAccess.get_open_error()
	record.store_string(JSON.stringify({EXISTED_KEY: existed, TEXT_KEY: original_text}))
	record.close()
	_active = true
	var config := ConfigFile.new()
	if existed:
		config.parse(original_text)
	config.set_value(DISPLAY_SECTION, WIDTH_KEY, size.x)
	config.set_value(DISPLAY_SECTION, HEIGHT_KEY, size.y)
	return config.save(_override_file)


func restore() -> void:
	_active = false
	if not FileAccess.file_exists(_record_file):
		return
	var record: Variant = JSON.parse_string(FileAccess.get_file_as_string(_record_file))
	if record is Dictionary and bool((record as Dictionary).get(EXISTED_KEY, false)):
		var file := FileAccess.open(_override_file, FileAccess.WRITE)
		if file != null:
			file.store_string(str((record as Dictionary).get(TEXT_KEY, "")))
			file.close()
	elif FileAccess.file_exists(_override_file):
		DirAccess.remove_absolute(_override_file)
	DirAccess.remove_absolute(_record_file)
