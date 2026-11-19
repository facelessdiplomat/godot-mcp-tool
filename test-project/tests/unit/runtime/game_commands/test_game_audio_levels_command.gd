extends GutTest

const GodotMcpCommandError := preload("res://addons/godot_mcp_tool/commands/command_error.gd")
const GodotMcpGameAudioLevelsCommand := preload("res://addons/godot_mcp_tool/runtime/game_commands/game_audio_levels_command.gd")
const GodotMcpGameScene := preload("res://addons/godot_mcp_tool/runtime/game_commands/game_scene.gd")
const GodotMcpJsonRpc := preload("res://addons/godot_mcp_tool/bridge/json_rpc.gd")

const MIX_RATE := 22050
const TONE_HERTZ := 440.0
const MUSIC_BUS := "TestMusic"

var _arena: Node3D
var _scene: GodotMcpGameScene


func before_each() -> void:
	AudioServer.add_bus()
	AudioServer.set_bus_name(AudioServer.bus_count - 1, MUSIC_BUS)
	_arena = Node3D.new()
	_arena.name = "Arena"
	_arena.scene_file_path = "res://arena.tscn"
	add_child_autofree(_arena)
	_scene = GodotMcpGameScene.new(func() -> Node: return _arena)


func after_each() -> void:
	AudioServer.remove_bus(AudioServer.get_bus_index(MUSIC_BUS))


func _tone() -> AudioStreamWAV:
	var samples := PackedByteArray()
	samples.resize(MIX_RATE * 2)
	for index in MIX_RATE:
		samples.encode_s16(index * 2, int(sin(TAU * TONE_HERTZ * index / MIX_RATE) * 16000))
	var stream := AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	stream.mix_rate = MIX_RATE
	stream.data = samples
	stream.loop_mode = AudioStreamWAV.LOOP_FORWARD
	stream.loop_end = MIX_RATE
	return stream


func _add_player(player_name: String, bus: String, playing: bool) -> AudioStreamPlayer:
	var player := AudioStreamPlayer.new()
	player.name = player_name
	player.stream = _tone()
	player.bus = bus
	_arena.add_child(player)
	if playing:
		player.play()
	return player


func _bus_named(levels: Dictionary, bus_name: String) -> Dictionary:
	for bus: Dictionary in levels["buses"]:
		if bus["name"] == bus_name:
			return bus
	return {}


func _levels(params: Dictionary = {"window_physics_frames": 20}) -> Variant:
	return await GodotMcpGameAudioLevelsCommand.new(_scene).execute(params)


func test_hears_a_tone_on_its_bus_and_on_master() -> void:
	_add_player("Music", MUSIC_BUS, true)
	var levels: Dictionary = await _levels()
	assert_false(_bus_named(levels, MUSIC_BUS)["silent"])
	assert_gt(float(_bus_named(levels, MUSIC_BUS)["highest_peak_db"]), -30.0)
	assert_false(_bus_named(levels, "Master")["silent"])
	assert_eq(levels["players"], [{"path": "Music", "type": "AudioStreamPlayer", "bus": MUSIC_BUS, "stream": "AudioStreamWAV", "volume_db": 0.0}])


func test_hears_silence_on_a_muted_bus_while_its_player_plays() -> void:
	AudioServer.set_bus_mute(AudioServer.get_bus_index(MUSIC_BUS), true)
	_add_player("Music", MUSIC_BUS, true)
	var levels: Dictionary = await _levels()
	assert_true(_bus_named(levels, MUSIC_BUS)["silent"])
	assert_true(_bus_named(levels, MUSIC_BUS)["mute"])
	assert_eq((levels["players"] as Array).size(), 1)


func test_lists_players_that_do_not_play() -> void:
	_add_player("Music", MUSIC_BUS, false)
	var levels: Dictionary = await _levels()
	assert_eq(levels["players"], [])
	assert_eq(levels["idle_players"], [{"path": "Music", "type": "AudioStreamPlayer", "bus": MUSIC_BUS, "autoplay": false}])


func test_shows_a_player_whose_bus_does_not_exist_on_master_where_it_plays() -> void:
	_add_player("Music", "Musik", true)
	var levels: Dictionary = await _levels()
	assert_eq((levels["players"] as Array)[0]["bus"], "Master")
	assert_false(_bus_named(levels, "Master")["silent"])


func test_refuses_a_window_out_of_range() -> void:
	var refused: Variant = await _levels({"window_physics_frames": 0})
	assert_true(refused is GodotMcpCommandError)
	assert_eq((refused as GodotMcpCommandError).code, GodotMcpJsonRpc.INVALID_PARAMS)
