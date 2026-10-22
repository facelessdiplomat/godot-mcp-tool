extends "../scene_edit_command.gd"

const NodeMove := preload("../../scene/edits/node_move.gd")


func _init(context: EditingContext) -> void:
	super(context, NodeMove)
