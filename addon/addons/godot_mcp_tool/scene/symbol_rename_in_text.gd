extends RefCounted

const GodotMcpSymbolUsesInText := preload("symbol_uses_in_text.gd")


static func renamed(text: String, request: Dictionary, scene_root_script: Callable) -> Dictionary:
	var lines := text.split("\n")
	var changes := {}
	for use: Dictionary in GodotMcpSymbolUsesInText.uses_of(text, request, scene_root_script):
		var index: int = use["line"] - 1
		lines[index] = _renamed_line(lines[index], use, request)
		changes[use["kind"]] = changes.get(use["kind"], 0) + use["count"]
	return {"text": "\n".join(lines), "changes": changes}


static func _renamed_line(line: String, use: Dictionary, request: Dictionary) -> String:
	var symbol: String = request["symbol"]
	var new_name: String = request["new_name"]
	var kind: String = use["kind"]
	if kind == GodotMcpSymbolUsesInText.CONNECTIONS:
		var attribute := "signal" if request["kind"] == GodotMcpSymbolUsesInText.SIGNAL_KIND else "method"
		return line.replace("%s=\"%s\"" % [attribute, symbol], "%s=\"%s\"" % [attribute, new_name])
	if kind == GodotMcpSymbolUsesInText.METHOD_KEYS:
		return line.replace("\"method\": &\"%s\"" % symbol, "\"method\": &\"%s\"" % new_name)
	if kind == GodotMcpSymbolUsesInText.PROPERTIES:
		return new_name + line.substr(symbol.length())
	if kind == GodotMcpSymbolUsesInText.ANIMATED_PATHS:
		return line.replace("NodePath(\"%s:%s\")" % [use["node"], symbol], "NodePath(\"%s:%s\")" % [use["node"], new_name])
	return line
