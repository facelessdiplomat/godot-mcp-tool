extends RefCounted

const GodotMcpGameChannel := preload("game_channel.gd")
const GodotMcpGameLauncher := preload("game_launcher.gd")
const GodotMcpGameState := preload("game_state.gd")
const GodotMcpLogStore := preload("log_store.gd")
const GodotMcpWindowSizeOverride := preload("window_size_override.gd")

var game: GodotMcpGameState
var log_store: GodotMcpLogStore
var launcher: GodotMcpGameLauncher
var channel: GodotMcpGameChannel
var window_size_override: GodotMcpWindowSizeOverride


func _init(game_state: GodotMcpGameState, store: GodotMcpLogStore, game_launcher: GodotMcpGameLauncher, game_channel: GodotMcpGameChannel, size_override: GodotMcpWindowSizeOverride = null) -> void:
	game = game_state
	log_store = store
	launcher = game_launcher
	channel = game_channel
	window_size_override = size_override
