extends "../scene_edit_command.gd"

const PropertyChange := preload("../../scene/edits/property_change.gd")


func _init(context: EditingContext) -> void:
	super(context, PropertyChange)
