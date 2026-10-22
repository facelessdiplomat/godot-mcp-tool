extends "../scene_edit_command.gd"

const NodeAddition := preload("../../scene/edits/node_addition.gd")


func _init(context: EditingContext) -> void:
	super(context, NodeAddition)
