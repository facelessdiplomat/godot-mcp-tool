extends "../scene_edit_command.gd"

const NodeDeletion := preload("../../scene/edits/node_deletion.gd")


func _init(context: EditingContext) -> void:
	super(context, NodeDeletion)
