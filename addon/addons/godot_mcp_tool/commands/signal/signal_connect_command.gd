extends "../scene_edit_command.gd"

const GodotMcpSignalConnection := preload("../../scene/edits/signal_connection.gd")


func _init(context: GodotMcpEditingContext) -> void:
	super(context, GodotMcpSignalConnection)
