extends "../scene_edit_command.gd"

const GodotMcpPropertyChange := preload("../../scene/edits/property_change.gd")


func _init(context: GodotMcpEditingContext) -> void:
	super(context, GodotMcpPropertyChange)
