extends GutTest

const GodotMcpCommandError := preload("res://addons/godot_mcp_tool/commands/command_error.gd")
const GodotMcpEditorSetPluginEnabledCommand := preload("res://addons/godot_mcp_tool/commands/editor/editor_set_plugin_enabled_command.gd")
const GodotMcpJsonRpc := preload("res://addons/godot_mcp_tool/bridge/json_rpc.gd")
const GodotMcpPluginAccess := preload("res://addons/godot_mcp_tool/editor/plugin_access.gd")

const HELPER_AUTOLOAD_SETTING := "autoload/GutHelper"


class FakePlugins:
	extends GodotMcpPluginAccess

	var enabled_names: Array = ["godot_mcp_tool"]
	var switches: Array = []

	func names() -> PackedStringArray:
		return PackedStringArray(["godot_mcp_tool", "gut", "gdUnit4"])

	func is_enabled(name: String) -> bool:
		return name in enabled_names

	func set_enabled(name: String, enabled: bool) -> void:
		switches.append([name, enabled])
		if enabled:
			enabled_names.append(name)
		else:
			enabled_names.erase(name)


var _plugins: FakePlugins
var _settings_saves := 0
var _save_result := OK


func before_each() -> void:
	_plugins = FakePlugins.new()
	_settings_saves = 0
	_save_result = OK


func after_each() -> void:
	ProjectSettings.set_setting(HELPER_AUTOLOAD_SETTING, null)


func _switch(params: Dictionary) -> Variant:
	var command := GodotMcpEditorSetPluginEnabledCommand.new(_plugins, func() -> Error:
		_settings_saves += 1
		return _save_result)
	return await command.execute(params)


func test_enables_a_plugin_by_its_folder_or_its_plugin_cfg() -> void:
	var result: Dictionary = await _switch({"plugin": "gut"})
	assert_eq(result["plugin"], "gut")
	assert_eq(result["enabled"], true)
	assert_eq(result["changed"], true)
	assert_eq(result["plugins"], [{"name": "godot_mcp_tool", "enabled": true}, {"name": "gut", "enabled": true}, {"name": "gdUnit4", "enabled": false}])
	var again: Dictionary = await _switch({"plugin": "res://addons/gut/plugin.cfg", "enabled": true})
	assert_eq(again["changed"], false)
	assert_eq(_plugins.switches, [["gut", true]])


func test_writes_project_godot_right_after_a_switch_instead_of_waiting_for_the_editor() -> void:
	await _switch({"plugin": "gut"})
	assert_eq(_settings_saves, 1)
	await _switch({"plugin": "gut"})
	assert_eq(_settings_saves, 1)
	await _switch({"plugin": "gut", "enabled": false})
	assert_eq(_settings_saves, 2)


func test_names_the_autoloads_from_the_folder_of_a_plugin_that_stay_after_it_is_off() -> void:
	ProjectSettings.set_setting(HELPER_AUTOLOAD_SETTING, "*res://addons/gut/helper.gd")
	var turned_on: Dictionary = await _switch({"plugin": "gut"})
	var turned_off: Dictionary = await _switch({"plugin": "gut", "enabled": false})
	assert_eq(turned_on["autoloads_left"], [])
	assert_eq(turned_off["autoloads_left"], [{"name": "GutHelper", "path": "res://addons/gut/helper.gd"}])


func test_explains_a_switch_that_project_godot_could_not_keep() -> void:
	_save_result = ERR_FILE_CANT_WRITE
	var failed: GodotMcpCommandError = await _switch({"plugin": "gut"})
	assert_eq(failed.code, GodotMcpJsonRpc.OPERATION_FAILED)
	assert_string_contains(failed.message, "Turned the plugin gut on, but project.godot could not be saved")


func test_disables_a_plugin() -> void:
	await _switch({"plugin": "gut"})
	var result: Dictionary = await _switch({"plugin": "gut", "enabled": false})
	assert_eq(result["enabled"], false)
	assert_eq(result["changed"], true)


func test_explains_plugins_it_cannot_switch() -> void:
	var missing: GodotMcpCommandError = await _switch({"plugin": "gutt"})
	assert_eq(missing.code, GodotMcpJsonRpc.NOT_FOUND)
	assert_string_contains(missing.hint, "gut")
	var own: GodotMcpCommandError = await _switch({"plugin": "godot_mcp_tool", "enabled": false})
	assert_eq(own.code, GodotMcpJsonRpc.INVALID_PARAMS)
	assert_eq(_plugins.switches, [])
