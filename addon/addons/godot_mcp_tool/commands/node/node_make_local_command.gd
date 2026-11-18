extends "../scene_edit_command.gd"

const GodotMcpInstanceLocalization := preload("../../scene/edits/instance_localization.gd")


func _init(context: GodotMcpEditingContext) -> void:
	super(context, GodotMcpInstanceLocalization)
