extends RefCounted

const GodotMcpShaderErrorCapture := preload("shader_error_capture.gd")


static func problems_of(path: String) -> Array:
	var capture := GodotMcpShaderErrorCapture.new()
	OS.add_logger(capture)
	var shader := ResourceLoader.load(path, "Shader", ResourceLoader.CACHE_MODE_IGNORE) as Shader
	if shader != null:
		RenderingServer.get_shader_parameter_list(shader.get_rid())
	OS.remove_logger(capture)
	return capture.taken().map(func(error: Dictionary) -> Dictionary: return {"file": error["file"] if not str(error["file"]).is_empty() else path, "line": error["line"], "message": error["message"]})
