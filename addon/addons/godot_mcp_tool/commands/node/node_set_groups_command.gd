extends "../scene_edit_command.gd"

const GroupChange := preload("../../scene/edits/group_change.gd")


func _init(context: EditingContext) -> void:
	super(context, GroupChange)
