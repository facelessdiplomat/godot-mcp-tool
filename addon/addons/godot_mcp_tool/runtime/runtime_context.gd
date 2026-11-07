extends RefCounted

const GodotMcpGameChannel := preload("game_channel.gd")
const GodotMcpGameLauncher := preload("game_launcher.gd")
const GodotMcpGameState := preload("game_state.gd")
const GodotMcpLogStore := preload("log_store.gd")

var game: GodotMcpGameState
var log_store: GodotMcpLogStore
var launcher: GodotMcpGameLauncher
var channel: GodotMcpGameChannel


func _init(game_state: GodotMcpGameState, store: GodotMcpLogStore, game_launcher: GodotMcpGameLauncher, game_channel: GodotMcpGameChannel) -> void:
	game = game_state
	log_store = store
	launcher = game_launcher
	channel = game_channel
