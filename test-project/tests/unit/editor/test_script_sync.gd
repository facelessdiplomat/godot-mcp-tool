extends GutTest

const CommandError := preload("res://addons/godot_mcp_tool/commands/command_error.gd")
const FakeScriptEditorAccess := preload("res://tests/support/fake_script_editor_access.gd")
const JsonRpc := preload("res://addons/godot_mcp_tool/bridge/json_rpc.gd")
const ScriptSync := preload("res://addons/godot_mcp_tool/editor/script_sync.gd")

var _scripts: FakeScriptEditorAccess
var _sync: ScriptSync


func before_each() -> void:
	_scripts = FakeScriptEditorAccess.new()
	_sync = ScriptSync.new(_scripts)


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
	assert_true(outcome is CommandError)
	assert_eq((outcome as CommandError).code, JsonRpc.CONFLICT)
	assert_string_contains((outcome as CommandError).message, "res://player/player.gd")
	assert_string_contains((outcome as CommandError).hint, "Reload from disk")


func test_names_files_it_cannot_map_to_a_path() -> void:
	_scripts.changed_outside = PackedStringArray(["notes.txt"])
	var outcome: Variant = await _sync.prepare_for_saving()
	assert_string_contains((outcome as CommandError).message, "notes.txt")
