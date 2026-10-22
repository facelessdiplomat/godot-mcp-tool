extends "../scene_edit_command.gd"

const SignalDisconnection := preload("../../scene/edits/signal_disconnection.gd")


func _init(context: EditingContext) -> void:
	super(context, SignalDisconnection)
