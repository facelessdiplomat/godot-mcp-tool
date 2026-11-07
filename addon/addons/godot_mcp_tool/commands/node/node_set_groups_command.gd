extends "../scene_edit_command.gd"

const GodotMcpGroupChange := preload("../../scene/edits/group_change.gd")


func _init(context: GodotMcpEditingContext) -> void:
	super(context, GodotMcpGroupChange)
