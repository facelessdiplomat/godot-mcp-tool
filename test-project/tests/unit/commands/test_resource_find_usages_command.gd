extends GutTest

const CommandError := preload("res://addons/godot_mcp_tool/commands/command_error.gd")
const JsonRpc := preload("res://addons/godot_mcp_tool/bridge/json_rpc.gd")
const ResourceFindUsagesCommand := preload("res://addons/godot_mcp_tool/commands/file/resource_find_usages_command.gd")
const ScratchProject := preload("res://tests/support/scratch_project.gd")

var _project: ScratchProject


func before_each() -> void:
	_project = ScratchProject.new()
	_project.build_crate_level()


func after_each() -> void:
	_project.remove()


func _find(path: String) -> Variant:
	return await ResourceFindUsagesCommand.new().execute({"path": path})


func test_reports_the_users_of_a_file_and_the_code_that_names_it() -> void:
	var result: Dictionary = await _find(_project.path("materials/ice.tres"))
	assert_eq(result["path"], _project.path("materials/ice.tres"))
	assert_true(result.has("uid"))
	assert_eq(result["used_by"], [{"path": _project.path("crate.tscn"), "uses": [_project.path("materials/ice.tres")]}])
	assert_eq(result["settings"], [])
	assert_eq((result["code"] as Array).map(func(mention: Dictionary) -> String: return mention["path"]), [_project.path("crate.gd")])


func test_reports_the_users_of_a_folder_from_outside_it() -> void:
	var result: Dictionary = await _find(_project.path("materials"))
	assert_eq(result["path"], _project.path("materials/"))
	assert_eq((result["used_by"] as Array).map(func(user: Dictionary) -> String: return user["path"]), [_project.path("crate.tscn")])


func test_explains_paths_it_cannot_use() -> void:
	var missing: CommandError = await _find(_project.path("materials/lava.tres"))
	assert_eq(missing.code, JsonRpc.NOT_FOUND)
	assert_eq(missing.message, "%s not found" % _project.path("materials/lava.tres"))
	var outside: CommandError = await _find("res://../secrets.tres")
	assert_eq(outside.code, JsonRpc.INVALID_PARAMS)
	var cache: CommandError = await _find("res://.godot/editor")
	assert_eq(cache.code, JsonRpc.INVALID_PARAMS)
	var whole_project: CommandError = await _find("res://")
	assert_eq(whole_project.code, JsonRpc.INVALID_PARAMS)
