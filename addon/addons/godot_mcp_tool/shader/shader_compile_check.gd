extends RefCounted

const GodotMcpShaderErrorCapture := preload("shader_error_capture.gd")


static func problems_of(path: String) -> Array:
	var shader := Shader.new()
	shader.set_include_path(path)
	var capture := GodotMcpShaderErrorCapture.new()
	OS.add_logger(capture)
	shader.code = FileAccess.get_file_as_string(path)
	RenderingServer.get_shader_parameter_list(shader.get_rid())
	OS.remove_logger(capture)
	return capture.taken().map(func(error: Dictionary) -> Dictionary: return {"file": error["file"] if not str(error["file"]).is_empty() else path, "line": error["line"], "message": error["message"]})
