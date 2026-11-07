extends "../scene_edit_command.gd"

const GodotMcpNodeDeletion := preload("../../scene/edits/node_deletion.gd")


func _init(context: GodotMcpEditingContext) -> void:
	super(context, GodotMcpNodeDeletion)
