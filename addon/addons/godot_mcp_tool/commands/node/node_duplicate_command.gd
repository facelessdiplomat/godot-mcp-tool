extends "../scene_edit_command.gd"

const GodotMcpNodeDuplication := preload("../../scene/edits/node_duplication.gd")


func _init(context: GodotMcpEditingContext) -> void:
	super(context, GodotMcpNodeDuplication)
