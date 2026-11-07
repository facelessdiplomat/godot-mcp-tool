extends "../scene_edit_command.gd"

const GodotMcpNodeAddition := preload("../../scene/edits/node_addition.gd")


func _init(context: GodotMcpEditingContext) -> void:
	super(context, GodotMcpNodeAddition)
