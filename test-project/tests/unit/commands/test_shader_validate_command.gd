extends GutTest

const GodotMcpCommandError := preload("res://addons/godot_mcp_tool/commands/command_error.gd")
const GodotMcpJsonRpc := preload("res://addons/godot_mcp_tool/bridge/json_rpc.gd")
const GodotMcpShaderValidateCommand := preload("res://addons/godot_mcp_tool/commands/shader/shader_validate_command.gd")
const ScratchFolder := preload("res://tests/support/scratch_folder.gd")

const FINE_SHADER := "shader_type spatial;\n\nuniform vec3 tint = vec3(1.0);\n\nvoid fragment() {\n\tALBEDO = tint;\n}\n"
const BROKEN_SHADER := "shader_type spatial;\n\nvoid fragment() {\n\tALBEDO = vec3(1.0, 0.0);\n}\n"
const INCLUDING_SHADER := "shader_type spatial;\n\n#include \"colors.gdshaderinc\"\n\nvoid fragment() {\n\tALBEDO = warm();\n}\n"
const BROKEN_INCLUDE := "vec3 warm() {\n\treturn vec3(1.0, 0.5);\n}\n"

var _scratch_directory: String


func before_each() -> void:
	_scratch_directory = "res://.godot/mcp_test_scratch/%d" % Time.get_ticks_usec()
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(_scratch_directory))


func after_each() -> void:
	ScratchFolder.remove(ProjectSettings.globalize_path(_scratch_directory))


func _write(file_name: String, code: String) -> String:
	var path := _scratch_directory.path_join(file_name)
	var file := FileAccess.open(path, FileAccess.WRITE)
	file.store_string(code)
	file.close()
	return path


func _expect_the_printed_compile_error() -> void:
	assert_engine_error("vec3(float,float)")
	assert_engine_error("Shader compilation failed")


func _validate(paths: Array) -> Variant:
	return await GodotMcpShaderValidateCommand.new().execute({"paths": paths})


func test_reports_the_line_and_message_of_a_shader_error() -> void:
	var broken := _write("broken.gdshader", BROKEN_SHADER)
	var fine := _write("fine.gdshader", FINE_SHADER)
	var result: Dictionary = await _validate([broken, fine])
	var shaders: Array = result["shaders"]
	assert_eq(shaders.size(), 2)
	assert_eq(shaders[0]["path"], broken)
	assert_eq((shaders[0]["problems"] as Array).size(), 1)
	assert_eq(shaders[0]["problems"][0]["line"], 4)
	assert_eq(shaders[0]["problems"][0]["file"], broken)
	assert_string_contains(shaders[0]["problems"][0]["message"], "vec3")
	assert_eq(shaders[1], {"path": fine, "problems": []})
	_expect_the_printed_compile_error()


func test_points_at_the_line_of_an_include_with_the_error() -> void:
	var including := _write("lit.gdshader", INCLUDING_SHADER)
	var include := _write("colors.gdshaderinc", BROKEN_INCLUDE)
	var result: Dictionary = await _validate([including])
	var problems: Array = result["shaders"][0]["problems"]
	assert_eq(problems.size(), 1)
	assert_eq(problems[0]["file"], include)
	assert_eq(problems[0]["line"], 2)
	_expect_the_printed_compile_error()


func test_explains_paths_it_cannot_check() -> void:
	var include := _write("colors.gdshaderinc", BROKEN_INCLUDE)
	var no_paths: GodotMcpCommandError = await _validate([])
	assert_eq(no_paths.code, GodotMcpJsonRpc.INVALID_PARAMS)
	var missing: GodotMcpCommandError = await _validate([_scratch_directory.path_join("missing.gdshader")])
	assert_eq(missing.code, GodotMcpJsonRpc.NOT_FOUND)
	var not_a_shader: GodotMcpCommandError = await _validate([include])
	assert_eq(not_a_shader.code, GodotMcpJsonRpc.INVALID_PARAMS)
	assert_string_contains(not_a_shader.message, "include")
