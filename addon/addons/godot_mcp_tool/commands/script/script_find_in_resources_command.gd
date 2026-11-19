extends "../command.gd"

const GodotMcpParams := preload("../params.gd")
const GodotMcpSymbolResourceFiles := preload("../../scene/symbol_resource_files.gd")
const GodotMcpSymbolUsesInText := preload("../../scene/symbol_uses_in_text.gd")

const KINDS := ["function", "signal", "variable", "other"]
const MAXIMUM_TEXT_LENGTH := 200


func execute(params: Dictionary) -> Variant:
	var script_path: Variant = GodotMcpParams.required_text(params, "script", "\"res://enemy.gd\"")
	var symbol: Variant = GodotMcpParams.required_text(params, "symbol", "\"take_damage\"")
	var kind: Variant = GodotMcpParams.text(params, "kind", "function")
	for value in [script_path, symbol, kind]:
		if value is GodotMcpCommandError:
			return value
	if not kind in KINDS:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "Unknown kind \"%s\"; use one of: %s" % [kind, ", ".join(PackedStringArray(KINDS))])
	var request := {"script": script_path, "symbol": symbol, "kind": kind}
	var resource_files := GodotMcpSymbolResourceFiles.new()
	var files: Array = []
	for path in GodotMcpSymbolResourceFiles.resource_files("res://"):
		var text := FileAccess.get_file_as_string(path)
		if not text.contains(symbol):
			continue
		var uses := GodotMcpSymbolUsesInText.uses_of(text, request, resource_files.root_script_of)
		if uses.is_empty():
			continue
		var lines := text.split("\n")
		files.append({"path": path, "uses": uses.map(func(use: Dictionary) -> Dictionary: return _with_text(use, lines))})
	return {"files": files}


static func _with_text(use: Dictionary, lines: PackedStringArray) -> Dictionary:
	var text := lines[int(use["line"]) - 1].strip_edges()
	if text.length() > MAXIMUM_TEXT_LENGTH:
		text = text.left(MAXIMUM_TEXT_LENGTH) + "…"
	return use.merged({"text": text})
