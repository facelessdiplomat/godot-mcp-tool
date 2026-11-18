extends "../command.gd"

const GodotMcpShaderCompileCheck := preload("../../shader/shader_compile_check.gd")

const SHADER_EXTENSION := "gdshader"
const INCLUDE_EXTENSION := "gdshaderinc"
const EXAMPLE := "Example: {\"paths\": [\"res://shaders/water.gdshader\"]}"


func execute(params: Dictionary) -> Variant:
	var paths: Variant = params.get("paths", [])
	if not paths is Array or (paths as Array).is_empty() or not (paths as Array).all(func(path: Variant) -> bool: return path is String):
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "\"paths\" lists the .gdshader files to check", EXAMPLE)
	for path in paths:
		var problem: Variant = _path_problem(path)
		if problem != null:
			return problem
	return {"shaders": (paths as Array).map(func(path: String) -> Dictionary: return {"path": path, "problems": GodotMcpShaderCompileCheck.problems_of(path)})}


static func _path_problem(path: String) -> Variant:
	if path.get_extension() == INCLUDE_EXTENSION:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "%s is a shader include; it is checked through the shaders that include it" % path, "Check a .gdshader file that includes it.")
	if path.get_extension() != SHADER_EXTENSION:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "%s is not a .gdshader file" % path, EXAMPLE)
	if not FileAccess.file_exists(path):
		return GodotMcpCommandError.new(GodotMcpJsonRpc.NOT_FOUND, "%s does not exist" % path)
	return null
