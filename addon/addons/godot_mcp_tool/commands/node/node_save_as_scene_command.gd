extends "../scene_edit_command.gd"

const GodotMcpBranchExtraction := preload("../../scene/edits/branch_extraction.gd")


func _init(context: GodotMcpEditingContext) -> void:
	super(context, GodotMcpBranchExtraction)
