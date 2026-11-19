extends "../../commands/command.gd"

const GodotMcpGameScene := preload("game_scene.gd")
const GodotMcpParams := preload("../../commands/params.gd")

const DEFAULT_WINDOW_PHYSICS_FRAMES := 30
const LONGEST_WINDOW_PHYSICS_FRAMES := 600
const SILENCE_BELOW_DB := -60.0
const QUIETEST_DB := -200.0
const MOST_IDLE_PLAYERS := 10
const PLAYER_TYPES := ["AudioStreamPlayer", "AudioStreamPlayer2D", "AudioStreamPlayer3D"]

var _scene: GodotMcpGameScene


func _init(scene: GodotMcpGameScene) -> void:
	_scene = scene


func execute(params: Dictionary) -> Variant:
	var window: Variant = GodotMcpParams.whole_number(params, "window_physics_frames", DEFAULT_WINDOW_PHYSICS_FRAMES)
	if window is GodotMcpCommandError:
		return window
	if window < 1 or window > LONGEST_WINDOW_PHYSICS_FRAMES:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "\"window_physics_frames\" must be from 1 to %d" % LONGEST_WINDOW_PHYSICS_FRAMES)
	var tree := Engine.get_main_loop() as SceneTree
	var highest := await _highest_peaks(tree, window)
	var buses: Array = []
	for bus in AudioServer.bus_count:
		buses.append({
			"name": AudioServer.get_bus_name(bus),
			"volume_db": AudioServer.get_bus_volume_db(bus),
			"send": str(AudioServer.get_bus_send(bus)),
			"mute": AudioServer.is_bus_mute(bus),
			"solo": AudioServer.is_bus_solo(bus),
			"highest_peak_db": highest[bus],
			"silent": highest[bus] < SILENCE_BELOW_DB,
		})
	var players := _players(tree)
	return {
		"scene": _scene.scene_path(),
		"window_physics_frames": window,
		"silence_below_db": SILENCE_BELOW_DB,
		"buses": buses,
		"players": players.filter(func(player: Node) -> bool: return player.get("playing")).map(_describe_playing),
		"idle_players": players.filter(func(player: Node) -> bool: return not player.get("playing")).slice(0, MOST_IDLE_PLAYERS).map(_describe_idle),
	}


func _highest_peaks(tree: SceneTree, window: int) -> Array:
	var highest: Array = []
	highest.resize(AudioServer.bus_count)
	highest.fill(QUIETEST_DB)
	var duration_msec := window * 1000.0 / Engine.physics_ticks_per_second
	var started_msec := Time.get_ticks_msec()
	while Time.get_ticks_msec() - started_msec < duration_msec:
		await tree.process_frame
		for bus in AudioServer.bus_count:
			for channel in AudioServer.get_bus_channels(bus):
				highest[bus] = maxf(highest[bus], maxf(AudioServer.get_bus_peak_volume_left_db(bus, channel), AudioServer.get_bus_peak_volume_right_db(bus, channel)))
	return highest


func _players(tree: SceneTree) -> Array:
	var players: Array = []
	for type in PLAYER_TYPES:
		players.append_array(tree.root.find_children("*", type, true, false))
	return players


func _describe_playing(player: Node) -> Dictionary:
	var stream := player.get("stream") as AudioStream
	return {
		"path": _scene.path_of(player),
		"type": player.get_class(),
		"bus": str(player.get("bus")),
		"stream": "none" if stream == null else (stream.resource_path if not stream.resource_path.is_empty() and not stream.resource_path.contains("::") else stream.get_class()),
		"volume_db": float(player.get("volume_db")),
	}


func _describe_idle(player: Node) -> Dictionary:
	return {"path": _scene.path_of(player), "type": player.get_class(), "bus": str(player.get("bus")), "autoplay": bool(player.get("autoplay"))}
