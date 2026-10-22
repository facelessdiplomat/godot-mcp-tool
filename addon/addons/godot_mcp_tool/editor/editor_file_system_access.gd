extends "file_system_access.gd"

var _applied_scans := 0


func _init() -> void:
	EditorInterface.get_resource_filesystem().sources_changed.connect(_count_applied_scan)


func is_scanning() -> bool:
	return EditorInterface.get_resource_filesystem().is_scanning()


func scan() -> void:
	EditorInterface.get_resource_filesystem().scan()


func applied_scans() -> int:
	return _applied_scans


func reimport(paths: PackedStringArray) -> void:
	EditorInterface.get_resource_filesystem().reimport_files(paths)


func update_files(paths: PackedStringArray) -> void:
	for path in paths:
		EditorInterface.get_resource_filesystem().update_file(path)


func _count_applied_scan(_sources_exist: bool) -> void:
	_applied_scans += 1
