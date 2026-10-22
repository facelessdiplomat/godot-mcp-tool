extends "res://addons/godot_mcp_tool/editor/file_system_access.gd"

var scanning := false
var scan_requests := 0
var applied := 0
var reimported: Array = []
var updated_files := PackedStringArray()
var applies_scans_at_once := false


func is_scanning() -> bool:
	return scanning


func scan() -> void:
	scan_requests += 1
	if applies_scans_at_once:
		applied += 1
		return
	scanning = true


func applied_scans() -> int:
	return applied


func finish_scan_thread() -> void:
	scanning = false


func apply_scan() -> void:
	scanning = false
	applied += 1


func reimport(paths: PackedStringArray) -> void:
	reimported.append(paths)


func update_files(paths: PackedStringArray) -> void:
	updated_files.append_array(paths)
