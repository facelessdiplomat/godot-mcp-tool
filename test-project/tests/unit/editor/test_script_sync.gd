extends GutTest

const GodotMcpCommandError := preload("res://addons/godot_mcp_tool/commands/command_error.gd")
const FakeScriptEditorAccess := preload("res://tests/support/fake_script_editor_access.gd")
const GodotMcpJsonRpc := preload("res://addons/godot_mcp_tool/bridge/json_rpc.gd")
const GodotMcpScriptSync := preload("res://addons/godot_mcp_tool/editor/script_sync.gd")

var _scripts: FakeScriptEditorAccess
var _sync: GodotMcpScriptSync


func before_each() -> void:
	_scripts = FakeScriptEditorAccess.new()
	_sync = GodotMcpScriptSync.new(_scripts)


func test_reloads_open_scripts_from_disk_first() -> void:
	await _sync.prepare_for_saving()
	assert_eq(_scripts.reload_count, 1)


func test_lists_the_unsaved_script_files_that_saving_writes() -> void:
	_scripts.unsaved = PackedStringArray(["res://player/player.gd", "res://levels/arena.tscn::GDScript_k2x7"])
	var outcome: Variant = await _sync.prepare_for_saving()
	assert_eq(outcome, ["res://player/player.gd"])


func test_refuses_when_an_unsaved_script_changed_on_disk() -> void:
	_scripts.unsaved = PackedStringArray(["res://player/player.gd"])
	_scripts.open_scripts = PackedStringArray(["res://player/player.gd", "res://enemy/enemy.gd"])
	_scripts.changed_outside = PackedStringArray(["player.gd"])
	var outcome: Variant = await _sync.prepare_for_saving()
	assert_true(outcome is GodotMcpCommandError)
	assert_eq((outcome as GodotMcpCommandError).code, GodotMcpJsonRpc.CONFLICT)
	assert_string_contains((outcome as GodotMcpCommandError).message, "res://player/player.gd")
	assert_string_contains((outcome as GodotMcpCommandError).hint, "Reload from disk")


func test_names_files_it_cannot_map_to_a_path() -> void:
	_scripts.changed_outside = PackedStringArray(["notes.txt"])
	var outcome: Variant = await _sync.prepare_for_saving()
	assert_string_contains((outcome as GodotMcpCommandError).message, "notes.txt")
