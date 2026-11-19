extends "../command.gd"

const GodotMcpEditingContext := preload("../../scene/editing_context.gd")
const GodotMcpParams := preload("../params.gd")
const GodotMcpSymbolRenameInText := preload("../../scene/symbol_rename_in_text.gd")
const GodotMcpSymbolResourceFiles := preload("../../scene/symbol_resource_files.gd")

const KINDS := ["function", "signal", "variable", "other"]
const IDENTIFIER_PATTERN := "^[A-Za-z_][A-Za-z0-9_]*$"

var _context: GodotMcpEditingContext
var _identifier := RegEx.create_from_string(IDENTIFIER_PATTERN)


func _init(context: GodotMcpEditingContext) -> void:
	_context = context


func execute(params: Dictionary) -> Variant:
	var script_path: Variant = GodotMcpParams.required_text(params, "script", "\"res://enemy.gd\"")
	var symbol: Variant = GodotMcpParams.required_text(params, "symbol", "\"take_damage\"")
	var new_name: Variant = GodotMcpParams.required_text(params, "new_name", "\"apply_damage\"")
	var kind: Variant = GodotMcpParams.text(params, "kind", "function")
	for value in [script_path, symbol, new_name, kind]:
		if value is GodotMcpCommandError:
			return value
	if not kind in KINDS:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "Unknown kind \"%s\"; use one of: %s" % [kind, ", ".join(PackedStringArray(KINDS))])
	if not _identifier.search(new_name) or not _identifier.search(symbol):
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "\"%s\" and \"%s\" must both be names of letters, digits and _" % [symbol, new_name])
	var request := {"script": script_path, "symbol": symbol, "new_name": new_name, "kind": kind}
	var resource_files := GodotMcpSymbolResourceFiles.new()
	var updated: Array = []
	for path in GodotMcpSymbolResourceFiles.resource_files("res://"):
		var text := FileAccess.get_file_as_string(path)
		if not text.contains(symbol):
			continue
		var result := GodotMcpSymbolRenameInText.renamed(text, request, resource_files.root_script_of)
		if not (result["changes"] as Dictionary).is_empty():
			updated.append({"path": path, "text": result["text"], "changes": result["changes"]})
	for entry in updated:
		var open_root := _context.scenes.find_open_root(entry["path"])
		if open_root != null and _context.scenes.access.is_scene_unsaved(open_root):
			return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "%s has unsaved changes in the editor" % entry["path"], "Save it with scene_save first, then rename again.")
	for entry in updated:
		var file := FileAccess.open(entry["path"], FileAccess.WRITE)
		file.store_string(entry["text"])
		file.close()
		if _context.scenes.find_open_root(entry["path"]) != null:
			_context.scenes.access.reload_scene(entry["path"])
	return {"files": updated.map(func(entry: Dictionary) -> Dictionary: return {"path": entry["path"], "changes": entry["changes"]})}

