extends RefCounted

const GameChannel := preload("game_channel.gd")
const GameLauncher := preload("game_launcher.gd")
const GameState := preload("game_state.gd")
const LogStore := preload("log_store.gd")

var game: GameState
var log_store: LogStore
var launcher: GameLauncher
var channel: GameChannel


func _init(game_state: GameState, store: LogStore, game_launcher: GameLauncher, game_channel: GameChannel) -> void:
	game = game_state
	log_store = store
	launcher = game_launcher
	channel = game_channel
