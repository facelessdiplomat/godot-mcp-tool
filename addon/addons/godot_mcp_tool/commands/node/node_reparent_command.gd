extends "../scene_edit_command.gd"

const GodotMcpNodeMove := preload("../../scene/edits/node_move.gd")


func _init(context: GodotMcpEditingContext) -> void:
	super(context, GodotMcpNodeMove)
