extends "../scene_edit_command.gd"

const NodeDuplication := preload("../../scene/edits/node_duplication.gd")


func _init(context: EditingContext) -> void:
	super(context, NodeDuplication)
