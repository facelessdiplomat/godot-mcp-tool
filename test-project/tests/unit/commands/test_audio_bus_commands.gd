extends GutTest

const FakeFileSystemAccess := preload("res://tests/support/fake_file_system_access.gd")
const GodotMcpAudioBusLayoutFile := preload("res://addons/godot_mcp_tool/audio/audio_bus_layout_file.gd")
const GodotMcpAudioBusesGetCommand := preload("res://addons/godot_mcp_tool/commands/audio/audio_buses_get_command.gd")
const GodotMcpAudioBusesSetCommand := preload("res://addons/godot_mcp_tool/commands/audio/audio_buses_set_command.gd")
const GodotMcpCommandError := preload("res://addons/godot_mcp_tool/commands/command_error.gd")
const GodotMcpJsonRpc := preload("res://addons/godot_mcp_tool/bridge/json_rpc.gd")

const SCRATCH_LAYOUT := "user://mcp_test_bus_layout.tres"

var _original_layout: AudioBusLayout
var _file_system: FakeFileSystemAccess
var _layout_file: GodotMcpAudioBusLayoutFile


func before_each() -> void:
	_original_layout = AudioServer.generate_bus_layout()
	_file_system = FakeFileSystemAccess.new()
	_layout_file = GodotMcpAudioBusLayoutFile.new(_file_system, SCRATCH_LAYOUT)


func after_each() -> void:
	AudioServer.set_bus_layout(_original_layout)
	if FileAccess.file_exists(SCRATCH_LAYOUT):
		DirAccess.remove_absolute(SCRATCH_LAYOUT)


func _set_buses(params: Dictionary) -> Variant:
	return await GodotMcpAudioBusesSetCommand.new(_layout_file).execute(params)


func _get_buses() -> Dictionary:
	return await GodotMcpAudioBusesGetCommand.new(_layout_file).execute({})


func test_lists_the_buses_with_their_volume_send_switches_and_effects() -> void:
	AudioServer.add_bus()
	AudioServer.set_bus_name(1, "Music")
	AudioServer.set_bus_volume_db(1, -6.0)
	AudioServer.set_bus_send(1, "Master")
	AudioServer.set_bus_mute(1, true)
	AudioServer.add_bus_effect(1, AudioEffectReverb.new())
	var result := await _get_buses()
	assert_eq(result["layout"], SCRATCH_LAYOUT)
	assert_false(result["saved"])
	assert_eq((result["buses"] as Array)[0]["name"], "Master")
	assert_eq((result["buses"] as Array)[0]["send"], "")
	assert_eq((result["buses"] as Array)[1], {"name": "Music", "volume_db": -6.0, "send": "Master", "mute": true, "solo": false, "bypass_effects": false, "effects": [{"type": "AudioEffectReverb", "enabled": true}]})


func test_adds_buses_that_send_to_master_and_saves_the_layout() -> void:
	var result: Dictionary = await _set_buses({"buses": [{"name": "Music", "volume_db": -6}, {"name": "Effects"}]})
	assert_eq(result["added"], ["Music", "Effects"])
	assert_eq(AudioServer.get_bus_index("Music"), 1)
	assert_eq(AudioServer.get_bus_volume_db(1), -6.0)
	assert_eq(AudioServer.get_bus_send(2), &"Master")
	var saved := ResourceLoader.load(SCRATCH_LAYOUT, "", ResourceLoader.CACHE_MODE_IGNORE) as AudioBusLayout
	assert_eq(saved.get("bus/1/name"), &"Music")
	assert_eq(saved.get("bus/2/name"), &"Effects")
	assert_eq(_file_system.updated_files, PackedStringArray([SCRATCH_LAYOUT]))


func test_changes_only_the_given_settings_of_an_existing_bus() -> void:
	await _set_buses({"buses": [{"name": "Music", "volume_db": -6, "mute": true}]})
	var result: Dictionary = await _set_buses({"buses": [{"name": "Music", "volume_db": -3.5}]})
	assert_eq(result["changed"], ["Music"])
	assert_eq(AudioServer.get_bus_volume_db(1), -3.5)
	assert_true(AudioServer.is_bus_mute(1))


func test_removes_buses_but_not_master() -> void:
	await _set_buses({"buses": [{"name": "Music"}, {"name": "Effects"}]})
	var result: Dictionary = await _set_buses({"remove": ["Music"]})
	assert_eq(result["removed"], ["Music"])
	assert_eq(AudioServer.bus_count, 2)
	assert_eq(AudioServer.get_bus_index("Effects"), 1)
	var error: GodotMcpCommandError = await _set_buses({"remove": ["Master"]})
	assert_eq(error.code, GodotMcpJsonRpc.INVALID_PARAMS)
	assert_eq(AudioServer.bus_count, 2)


func test_refuses_a_send_to_a_bus_that_does_not_come_before_it_and_changes_nothing() -> void:
	var error: GodotMcpCommandError = await _set_buses({"buses": [{"name": "Music", "send": "Effects"}, {"name": "Effects"}]})
	assert_eq(error.code, GodotMcpJsonRpc.INVALID_PARAMS)
	assert_string_contains(error.message, "Effects")
	assert_eq(AudioServer.bus_count, 1)
	assert_false(FileAccess.file_exists(SCRATCH_LAYOUT))


func test_explains_an_unknown_bus_to_remove_with_similar_names() -> void:
	await _set_buses({"buses": [{"name": "Music"}]})
	var error: GodotMcpCommandError = await _set_buses({"remove": ["Musik"]})
	assert_eq(error.code, GodotMcpJsonRpc.INVALID_PARAMS)
	assert_string_contains(error.message + " " + error.hint, "Music")


func test_refuses_to_send_master_to_another_bus() -> void:
	await _set_buses({"buses": [{"name": "Music"}]})
	var error: GodotMcpCommandError = await _set_buses({"buses": [{"name": "Master", "send": "Music"}]})
	assert_eq(error.code, GodotMcpJsonRpc.INVALID_PARAMS)
	assert_eq(AudioServer.get_bus_send(0), &"")
