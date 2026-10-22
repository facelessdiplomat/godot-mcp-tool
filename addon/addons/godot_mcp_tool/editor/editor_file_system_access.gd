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


func _count_applied_scan(_sources_exist: bool) -> void:
	_applied_scans += 1
