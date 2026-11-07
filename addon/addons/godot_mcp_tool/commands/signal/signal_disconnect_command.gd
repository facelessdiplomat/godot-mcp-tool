extends "../scene_edit_command.gd"

const GodotMcpSignalDisconnection := preload("../../scene/edits/signal_disconnection.gd")


func _init(context: GodotMcpEditingContext) -> void:
	super(context, GodotMcpSignalDisconnection)
