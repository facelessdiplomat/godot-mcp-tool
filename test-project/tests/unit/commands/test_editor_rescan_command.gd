extends GutTest

const GodotMcpCommandError := preload("res://addons/godot_mcp_tool/commands/command_error.gd")
const GodotMcpEditorRescanCommand := preload("res://addons/godot_mcp_tool/commands/editor/editor_rescan_command.gd")
const FakeExtensionAccess := preload("res://tests/support/fake_extension_access.gd")
const FakeFileSystemAccess := preload("res://tests/support/fake_file_system_access.gd")
const FakeScriptEditorAccess := preload("res://tests/support/fake_script_editor_access.gd")
const GodotMcpJsonRpc := preload("res://addons/godot_mcp_tool/bridge/json_rpc.gd")

const FINISH_WAIT_SECONDS := 2.0

var _file_system: FakeFileSystemAccess
var _scripts: FakeScriptEditorAccess
var _extensions: FakeExtensionAccess
var _command: GodotMcpEditorRescanCommand
var _outcome: Variant
var _finished := false


func before_each() -> void:
	_file_system = FakeFileSystemAccess.new()
	_scripts = FakeScriptEditorAccess.new()
	_extensions = FakeExtensionAccess.new()
	_command = GodotMcpEditorRescanCommand.new(_file_system, _scripts, _extensions)
	_outcome = null
	_finished = false


func _rescan_in_background(params: Dictionary = {}) -> void:
	_outcome = await _command.execute(params)
	_finished = true


func _wait_until_finished() -> void:
	await wait_until(func() -> bool: return _finished, FINISH_WAIT_SECONDS)


func test_starts_a_scan_when_none_is_running() -> void:
	_rescan_in_background()
	assert_eq(_file_system.scan_requests, 1)
	_file_system.apply_scan()
	await _wait_until_finished()
	assert_true(_outcome is Dictionary)
	assert_true((_outcome as Dictionary).has("duration_ms"))


func test_waits_for_a_scan_in_progress_instead_of_starting_another() -> void:
	_file_system.scanning = true
	_rescan_in_background()
	_file_system.apply_scan()
	await _wait_until_finished()
	assert_eq(_file_system.scan_requests, 0)
	assert_true(_outcome is Dictionary)


func test_keeps_waiting_after_the_scan_thread_ends_until_the_editor_has_applied_the_scan() -> void:
	_rescan_in_background()
	_file_system.finish_scan_thread()
	await wait_process_frames(5)
	assert_false(_finished)
	_file_system.apply_scan()
	await _wait_until_finished()
	assert_true(_outcome is Dictionary)


func test_reloads_the_open_scripts_once_the_scan_is_applied() -> void:
	_rescan_in_background()
	await wait_process_frames(2)
	assert_eq(_scripts.reload_count, 0)
	_file_system.apply_scan()
	await _wait_until_finished()
	assert_eq(_scripts.reload_count, 1)


func test_gives_up_when_the_scan_is_not_applied_within_the_timeout() -> void:
	_rescan_in_background({"timeout_ms": 50})
	await _wait_until_finished()
	assert_true(_outcome is GodotMcpCommandError)
	assert_eq((_outcome as GodotMcpCommandError).code, GodotMcpJsonRpc.TIMEOUT)
	assert_eq(_scripts.reload_count, 0)


func test_reports_the_extensions_the_editor_reloaded_since_the_reload_request() -> void:
	_extensions.rebuilt = PackedStringArray(["res://bin/game.gdextension"])
	_rescan_in_background()
	_file_system.apply_scan()
	await _wait_until_finished()
	assert_eq((_outcome as Dictionary)["reloaded_extensions"], PackedStringArray(["res://bin/game.gdextension"]))
	assert_eq(_extensions.reload_requests, 0)


func test_reports_no_extensions_when_none_was_rebuilt() -> void:
	_rescan_in_background()
	_file_system.apply_scan()
	await _wait_until_finished()
	assert_eq((_outcome as Dictionary)["reloaded_extensions"], PackedStringArray())
