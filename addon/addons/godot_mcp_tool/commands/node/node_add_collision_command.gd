extends "../scene_edit_command.gd"

const GodotMcpCollisionAddition := preload("../../scene/edits/collision_addition.gd")


func _init(context: GodotMcpEditingContext) -> void:
	super(context, GodotMcpCollisionAddition)
