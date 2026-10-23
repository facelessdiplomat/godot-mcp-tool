extends "../command.gd"

const ScriptEditorAccess := preload("../../editor/script_editor_access.gd")

var _scripts: ScriptEditorAccess


func _init(scripts: ScriptEditorAccess) -> void:
	_scripts = scripts


func execute(_params: Dictionary) -> Variant:
	return {"breakpoints": _scripts.breakpoints()}
