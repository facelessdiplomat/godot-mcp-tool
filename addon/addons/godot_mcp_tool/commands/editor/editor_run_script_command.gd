extends "../command.gd"

const EditingContext := preload("../../scene/editing_context.gd")
const ScriptErrorCapture := preload("../../editor/script_error_capture.gd")

const HEADER_LINES := ["@tool", "extends RefCounted", "", "", "func run(scene: Node) -> Variant:"]
const TAB_INDENT := "\t"
const SPACE_INDENT := "    "
const IN_MEMORY_SCRIPT_FILE := "gdscript://%d.gd"
const CODE_HINT := "The code is the body of func run(scene: Node) -> Variant, where scene is the scene open in the editor; return a value to see it."

var _context: EditingContext


func _init(context: EditingContext) -> void:
	_context = context


func execute(params: Dictionary) -> Variant:
	var code: Variant = params.get("code")
	if not code is String or (code as String).strip_edges().is_empty():
		return CommandError.new(JsonRpc.INVALID_PARAMS, "\"code\" is required", "Example: \"return scene.get_child_count()\"")
	var script := GDScript.new()
	script.source_code = _wrapped(code)
	var script_file := IN_MEMORY_SCRIPT_FILE % script.get_instance_id()
	var capture := ScriptErrorCapture.new()
	OS.add_logger(capture)
	var reload_error := script.reload()
	if reload_error != OK:
		OS.remove_logger(capture)
		return CommandError.new(JsonRpc.INVALID_PARAMS, "The code does not compile:\n%s" % _describe(_code_errors(capture.errors_in(script_file))), CODE_HINT)
	var runner: Object = script.new()
	var value: Variant = runner.call(&"run", _context.scenes.access.edited_scene_root())
	OS.remove_logger(capture)
	return {"value": _context.codec.encode(value), "errors": _code_errors(capture.errors_in(script_file))}


static func _wrapped(code: String) -> String:
	var code_lines := code.replace("\r\n", "\n").split("\n")
	var indent := SPACE_INDENT if Array(code_lines).any(func(line: String) -> bool: return line.begins_with(" ")) else TAB_INDENT
	var lines := PackedStringArray(HEADER_LINES)
	for line in code_lines:
		lines.append("" if line.strip_edges().is_empty() else indent + line)
	lines.append(indent + "return null")
	return "\n".join(lines) + "\n"


static func _code_errors(errors: Array) -> Array:
	return errors.map(func(error: Dictionary) -> Dictionary: return {"line": int(error["line"]) - HEADER_LINES.size(), "message": error["message"]})


static func _describe(errors: Array) -> String:
	if errors.is_empty():
		return "- the editor gave no details"
	return "\n".join(PackedStringArray(errors.map(func(error: Dictionary) -> String: return "- line %d: %s" % [error["line"], error["message"]])))
