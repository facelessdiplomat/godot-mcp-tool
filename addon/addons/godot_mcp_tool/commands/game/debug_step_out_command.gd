extends "../command.gd"

const GodotMcpGameChannel := preload("../../runtime/game_channel.gd")

const STEP_OUT := "out"

var _channel: GodotMcpGameChannel


func _init(channel: GodotMcpGameChannel) -> void:
	_channel = channel


func execute(_params: Dictionary) -> Variant:
	if not _channel.send_debugger_command(STEP_OUT):
		return GodotMcpCommandError.new(GodotMcpJsonRpc.GAME_NOT_RUNNING, "The game is not running from the editor", "Start it with game_run, and stop it at a breakpoint first.")
	return {"sent": true}
