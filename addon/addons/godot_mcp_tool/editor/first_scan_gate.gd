extends RefCounted

const FileSystemAccess := preload("file_system_access.gd")
const Waiting := preload("../util/waiting.gd")

const TIMEOUT_MSEC := 20000

var _file_system: FileSystemAccess
var _timeout_msec: int
var _first_scan_running: bool


func _init(file_system: FileSystemAccess, timeout_msec := TIMEOUT_MSEC) -> void:
	_file_system = file_system
	_timeout_msec = timeout_msec
	_first_scan_running = file_system.is_scanning()


func wait_until_finished() -> bool:
	if not _first_scan_running:
		return true
	var deadline_msec := Time.get_ticks_msec() + _timeout_msec
	await Waiting.until(func() -> bool: return not _file_system.is_scanning(), _timeout_msec)
	_first_scan_running = _file_system.is_scanning()
	return not _first_scan_running and Time.get_ticks_msec() <= deadline_msec
