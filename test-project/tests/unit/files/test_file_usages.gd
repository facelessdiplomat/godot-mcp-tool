extends GutTest

const FileUsages := preload("res://addons/godot_mcp_tool/files/file_usages.gd")
const ProjectFileIndex := preload("res://addons/godot_mcp_tool/files/project_file_index.gd")
const ScratchProject := preload("res://tests/support/scratch_project.gd")

const MAIN_SCENE_SETTING := "application/run/main_scene"
const AUTOLOAD_SETTING := "autoload/McpTestCrate"

var _project: ScratchProject
var _main_scene: Variant


func before_each() -> void:
	_project = ScratchProject.new()
	_project.build_crate_level()
	_main_scene = ProjectSettings.get_setting(MAIN_SCENE_SETTING)


func after_each() -> void:
	ProjectSettings.set_setting(MAIN_SCENE_SETTING, _main_scene)
	if ProjectSettings.has_setting(AUTOLOAD_SETTING):
		ProjectSettings.clear(AUTOLOAD_SETTING)
	_project.remove()


func _users(usages: Dictionary) -> Array:
	return (usages["used_by"] as Array).map(func(user: Dictionary) -> String: return user["path"])


func _mention_places(usages: Dictionary) -> Array:
	return (usages["code"] as Array).map(func(mention: Dictionary) -> String: return "%s:%d" % [mention["path"], mention["line"]])


func test_lists_the_files_of_a_folder_without_import_and_uid_files() -> void:
	var files := ProjectFileIndex.files_under(_project.root)
	assert_eq(files, PackedStringArray([_project.path("crate.gd"), _project.path("crate.tscn"), _project.path("level.tscn"), _project.path("materials/ice.tres")]))


func test_finds_the_scenes_and_resources_that_use_a_file() -> void:
	var usages := FileUsages.find(PackedStringArray([_project.path("materials/ice.tres")]), _project.root)
	assert_eq(usages["used_by"], [{"path": _project.path("crate.tscn"), "uses": [_project.path("materials/ice.tres")]}])
	assert_eq(_users(FileUsages.find(PackedStringArray([_project.path("crate.tscn")]), _project.root)), [_project.path("level.tscn")])


func test_finds_code_that_names_a_file() -> void:
	var usages := FileUsages.find(PackedStringArray([_project.path("materials/ice.tres")]), _project.root)
	assert_eq(usages["code"], [{"path": _project.path("crate.gd"), "line": 3, "text": "const SKIN := preload(\"%s\")" % _project.path("materials/ice.tres")}])


func test_finds_code_that_names_a_file_by_its_uid() -> void:
	var ice_uid := _project.assign_uid("materials/ice.tres")
	_project.write_text("frost.gd", "extends Node\n\nconst FROST := preload(\"%s\")\n" % ice_uid)
	var usages := FileUsages.find(PackedStringArray([_project.path("materials/ice.tres")]), _project.root)
	var by_path := FileUsages.find(PackedStringArray([_project.path("materials/ice.tres")]), _project.root, FileUsages.CodeMentions.BY_PATH)
	assert_eq(_mention_places(usages), [_project.path("crate.gd") + ":3", _project.path("frost.gd") + ":3"])
	assert_eq(_mention_places(by_path), [_project.path("crate.gd") + ":3"])


func test_finds_code_that_names_a_file_of_a_folder_by_its_uid() -> void:
	var ice_uid := _project.assign_uid("materials/ice.tres")
	_project.write_text("frost.gd", "extends Node\n\nconst FROST := preload(\"%s\")\n" % ice_uid)
	var usages := FileUsages.find(PackedStringArray([_project.path("materials/")]), _project.root)
	assert_eq(_mention_places(usages), [_project.path("crate.gd") + ":3", _project.path("frost.gd") + ":3"])


func test_finds_the_uses_of_every_file_in_a_folder() -> void:
	var usages := FileUsages.find(PackedStringArray([_project.path("materials/")]), _project.root)
	assert_eq(_users(usages), [_project.path("crate.tscn")])
	assert_eq((usages["code"] as Array).size(), 1)


func test_searches_the_code_of_addons_only_for_files_of_addons() -> void:
	_project.write_text("addons/tooltips/strings.json", "{}\n")
	_project.write_text("addons/tooltips/hint.gd", "extends Node\n\nconst EXAMPLE := \"%s\"\nconst STRINGS := \"%s\"\n" % [_project.path("materials/ice.tres"), _project.path("addons/tooltips/strings.json")])
	var ice_usages := FileUsages.find(PackedStringArray([_project.path("materials/ice.tres")]), _project.root)
	var strings_usages := FileUsages.find(PackedStringArray([_project.path("addons/tooltips/strings.json")]), _project.root)
	assert_eq(_mention_places(ice_usages), [_project.path("crate.gd") + ":3"])
	assert_eq(_mention_places(strings_usages), [_project.path("addons/tooltips/hint.gd") + ":4"])


func test_finds_project_settings_that_point_at_a_file() -> void:
	ProjectSettings.set_setting(MAIN_SCENE_SETTING, _project.path("level.tscn"))
	ProjectSettings.set_setting(AUTOLOAD_SETTING, "*" + _project.path("crate.gd"))
	var level_usages := FileUsages.find(PackedStringArray([_project.path("level.tscn")]), _project.root)
	var script_usages := FileUsages.find(PackedStringArray([_project.path("crate.gd")]), _project.root)
	assert_eq(level_usages["settings"], [{"name": MAIN_SCENE_SETTING, "value": _project.path("level.tscn")}])
	assert_eq(script_usages["settings"], [{"name": AUTOLOAD_SETTING, "value": "*" + _project.path("crate.gd")}])
	assert_eq(_users(script_usages), [_project.path("crate.tscn")])


func test_leaves_out_uses_from_inside_the_targets_on_request() -> void:
	var targets := PackedStringArray([_project.path("materials/ice.tres"), _project.path("crate.tscn")])
	var everything := FileUsages.find(targets, _project.root)
	var from_outside := FileUsages.outside(everything, targets)
	assert_eq(_users(everything), [_project.path("crate.tscn"), _project.path("level.tscn")])
	assert_eq(_users(from_outside), [_project.path("level.tscn")])
