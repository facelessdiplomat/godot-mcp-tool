extends RefCounted

const GodotMcpFileSystemAccess := preload("../editor/file_system_access.gd")

const LAYOUT_SETTING := "audio/buses/default_bus_layout"
const DEFAULT_LAYOUT_PATH := "res://default_bus_layout.tres"

var _file_system: GodotMcpFileSystemAccess
var _fixed_path: String


func _init(file_system: GodotMcpFileSystemAccess, fixed_path: String = "") -> void:
	_file_system = file_system
	_fixed_path = fixed_path


func path() -> String:
	if not _fixed_path.is_empty():
		return _fixed_path
	var configured := str(ProjectSettings.get_setting(LAYOUT_SETTING, DEFAULT_LAYOUT_PATH))
	if configured.begins_with("uid://"):
		var id := ResourceUID.text_to_id(configured)
		configured = ResourceUID.get_id_path(id) if ResourceUID.has_id(id) else ""
	return DEFAULT_LAYOUT_PATH if configured.is_empty() else configured


func exists() -> bool:
	return FileAccess.file_exists(path())


func save_current() -> Error:
	var layout_path := path()
	var error := ResourceSaver.save(AudioServer.generate_bus_layout(), layout_path)
	if error == OK:
		_file_system.update_files(PackedStringArray([layout_path]))
	return error
