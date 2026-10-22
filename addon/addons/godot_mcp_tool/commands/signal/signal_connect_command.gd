extends "../scene_edit_command.gd"

const SignalConnection := preload("../../scene/edits/signal_connection.gd")


func _init(context: EditingContext) -> void:
	super(context, SignalConnection)
