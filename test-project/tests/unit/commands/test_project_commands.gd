extends GutTest

const CommandError := preload("res://addons/godot_mcp_tool/commands/command_error.gd")
const JsonRpc := preload("res://addons/godot_mcp_tool/bridge/json_rpc.gd")
const ProjectInfoCommand := preload("res://addons/godot_mcp_tool/commands/project/project_info_command.gd")
const ProjectSettingsGetCommand := preload("res://addons/godot_mcp_tool/commands/project/project_settings_get_command.gd")
const ProjectSettingsSetCommand := preload("res://addons/godot_mcp_tool/commands/project/project_settings_set_command.gd")
const VariantCodec := preload("res://addons/godot_mcp_tool/codec/variant_codec.gd")

const DESCRIPTION_SETTING := "application/config/description"

var _save_calls := 0
var _original_description: Variant


func before_each() -> void:
	_save_calls = 0
	_original_description = ProjectSettings.get_setting(DESCRIPTION_SETTING)


func after_each() -> void:
	ProjectSettings.set_setting(DESCRIPTION_SETTING, _original_description)


func _fake_indentation() -> Dictionary:
	return {"style": "tabs", "size": 4}


func _fake_save() -> Error:
	_save_calls += 1
	return OK


func test_describes_the_project() -> void:
	var info: Dictionary = await ProjectInfoCommand.new(_fake_indentation).execute({})
	assert_eq(info["name"], "godot-mcp-tool test project")
	assert_eq(info["main_scene"], "res://main.tscn")
	assert_eq(info["indentation"], {"style": "tabs", "size": 4})
	assert_has(info["enabled_plugins"], "res://addons/godot_mcp_tool/plugin.cfg")
	assert_has(info["folders"], "tests")
	var global_class_names: Array = (info["global_classes"] as Array).map(func(entry: Dictionary) -> String: return entry["name"])
	assert_has(global_class_names, "PatrolPoint")
	assert_false(str((info["global_classes"][0] as Dictionary)["path"]).begins_with("res://addons/"))
	assert_true((info["window"] as Dictionary).has("width"))
	assert_true(info.has("renderer"))
	assert_true(info.has("physics_engine_3d"))


func test_gets_settings_by_name() -> void:
	var result: Dictionary = await ProjectSettingsGetCommand.new(VariantCodec.new()).execute({"names": ["application/config/name"]})
	assert_eq((result["settings"][0] as Dictionary)["value"], "godot-mcp-tool test project")


func test_gets_settings_by_prefix() -> void:
	var result: Dictionary = await ProjectSettingsGetCommand.new(VariantCodec.new()).execute({"prefix": "display/window/size/"})
	var names: Array = (result["settings"] as Array).map(func(entry: Dictionary) -> String: return entry["name"])
	assert_has(names, "display/window/size/viewport_width")


func test_reports_unknown_setting_names_with_suggestions() -> void:
	var result: Dictionary = await ProjectSettingsGetCommand.new(VariantCodec.new()).execute({"names": ["application/config/nam"]})
	assert_string_contains((result["unknown"][0] as Dictionary)["reason"], "application/config/name")


func test_requires_names_or_a_prefix() -> void:
	var error: Variant = await ProjectSettingsGetCommand.new(VariantCodec.new()).execute({})
	assert_eq((error as CommandError).code, JsonRpc.INVALID_PARAMS)


func test_sets_settings_and_saves_once() -> void:
	var result: Dictionary = await ProjectSettingsSetCommand.new(VariantCodec.new(), _fake_save).execute({"values": {DESCRIPTION_SETTING: "A small arena"}})
	assert_eq(result["applied"], [DESCRIPTION_SETTING])
	assert_eq(ProjectSettings.get_setting(DESCRIPTION_SETTING), "A small arena")
	assert_eq(_save_calls, 1)
	assert_true((result["previous"] as Dictionary).has(DESCRIPTION_SETTING))


func test_rejects_unknown_settings_without_saving() -> void:
	var result: Dictionary = await ProjectSettingsSetCommand.new(VariantCodec.new(), _fake_save).execute({"values": {"application/config/descripton": "x"}})
	assert_eq(result["applied"], [])
	assert_string_contains((result["rejected"][0] as Dictionary)["reason"], DESCRIPTION_SETTING)
	assert_eq(_save_calls, 0)


func test_decodes_values_by_the_setting_type() -> void:
	var result: Dictionary = await ProjectSettingsSetCommand.new(VariantCodec.new(), _fake_save).execute({"values": {DESCRIPTION_SETTING: 5}})
	assert_string_contains((result["rejected"][0] as Dictionary)["reason"], "text")
