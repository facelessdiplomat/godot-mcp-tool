extends "../command.gd"

const GodotMcpEditingContext := preload("../../scene/editing_context.gd")
const GodotMcpScriptEditorAccess := preload("../../editor/script_editor_access.gd")

const BUILT_IN_RESOURCE_SEPARATOR := "::"

var _context: GodotMcpEditingContext
var _scripts: GodotMcpScriptEditorAccess


func _init(context: GodotMcpEditingContext, scripts: GodotMcpScriptEditorAccess) -> void:
	_context = context
	_scripts = scripts


func execute(_params: Dictionary) -> Variant:
	var scenes := PackedStringArray()
	for root in _context.scenes.access.open_scene_roots():
		if not root.scene_file_path.is_empty() and _context.scenes.access.is_scene_unsaved(root):
			scenes.append(root.scene_file_path)
	var scripts := PackedStringArray()
	for file_path in _scripts.unsaved_files():
		if not file_path.contains(BUILT_IN_RESOURCE_SEPARATOR):
			scripts.append(file_path)
	return {"scenes": scenes, "scripts": scripts}
