extends "../command.gd"

const GodotMcpScriptEditorAccess := preload("../../editor/script_editor_access.gd")

var _scripts: GodotMcpScriptEditorAccess


func _init(scripts: GodotMcpScriptEditorAccess) -> void:
	_scripts = scripts


func execute(_params: Dictionary) -> Variant:
	return {"breakpoints": _scripts.breakpoints()}
