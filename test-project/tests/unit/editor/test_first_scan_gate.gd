extends GutTest

const FakeFileSystemAccess := preload("res://tests/support/fake_file_system_access.gd")
const FirstScanGate := preload("res://addons/godot_mcp_tool/editor/first_scan_gate.gd")

const SHORT_TIMEOUT_MSEC := 100
const FINISH_WAIT_SECONDS := 2.0

var _file_system: FakeFileSystemAccess
var _gate: FirstScanGate
var _answer: Variant


func before_each() -> void:
	_file_system = FakeFileSystemAccess.new()
	_answer = null


func _wait_in_background() -> void:
	_answer = await _gate.wait_until_finished()


func test_lets_requests_through_at_once_when_the_plugin_starts_after_the_first_scan() -> void:
	_gate = FirstScanGate.new(_file_system)
	_wait_in_background()
	assert_eq(_answer, true)


func test_holds_requests_until_the_first_scan_ends() -> void:
	_file_system.scanning = true
	_gate = FirstScanGate.new(_file_system)
	_wait_in_background()
	await wait_process_frames(5)
	assert_null(_answer)
	_file_system.finish_scan_thread()
	await wait_until(func() -> bool: return _answer != null, FINISH_WAIT_SECONDS)
	assert_eq(_answer, true)


func test_lets_requests_through_during_later_scans() -> void:
	_file_system.scanning = true
	_gate = FirstScanGate.new(_file_system)
	_file_system.finish_scan_thread()
	await _gate.wait_until_finished()
	_file_system.scanning = true
	_wait_in_background()
	assert_eq(_answer, true)


func test_gives_up_when_the_first_scan_takes_too_long() -> void:
	_file_system.scanning = true
	_gate = FirstScanGate.new(_file_system, SHORT_TIMEOUT_MSEC)
	_wait_in_background()
	await wait_until(func() -> bool: return _answer != null, FINISH_WAIT_SECONDS)
	assert_eq(_answer, false)
