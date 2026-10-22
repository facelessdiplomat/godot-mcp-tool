extends RefCounted

const GameLauncher := preload("game_launcher.gd")
const GameState := preload("game_state.gd")
const LogStore := preload("log_store.gd")

var game: GameState
var log_store: LogStore
var launcher: GameLauncher


func _init(game_state: GameState, store: LogStore, game_launcher: GameLauncher) -> void:
	game = game_state
	log_store = store
	launcher = game_launcher
