extends GutTest

const GodotMcpChangedScriptReloader := preload("res://addons/godot_mcp_tool/editor/changed_script_reloader.gd")

const FOLDER := "user://changed_script_reloader"
const ONE_ARGUMENT := "extends RefCounted\n\n\nfunc take_damage(amount: int) -> int:\n\treturn amount\n"
const TWO_ARGUMENTS := "extends RefCounted\n\n\nfunc take_damage(amount: int, source: String) -> String:\n\treturn \"%d from %s\" % [amount, source]\n"

var _enemy_path := ""
var _loaded: Script


func before_each() -> void:
	DirAccess.make_dir_recursive_absolute(FOLDER)
	_enemy_path = FOLDER.path_join("enemy_%d.gd" % Time.get_ticks_usec())
	_write(_enemy_path, ONE_ARGUMENT)
	_loaded = ResourceLoader.load(_enemy_path) as Script


func after_each() -> void:
	_loaded = null
	DirAccess.remove_absolute(_enemy_path)


func _write(path: String, text: String) -> void:
	var file := FileAccess.open(path, FileAccess.WRITE)
	file.store_string(text)
	file.close()


func _argument_count(script: Script, method_name: String) -> int:
	for method in script.get_script_method_list():
		if method["name"] == method_name:
			return (method["args"] as Array).size()
	return -1


func test_reloads_a_loaded_script_whose_file_changed() -> void:
	_write(_enemy_path, TWO_ARGUMENTS)

	var reloaded := GodotMcpChangedScriptReloader.reload_changed(PackedStringArray([_enemy_path]), PackedStringArray())

	assert_eq(reloaded, PackedStringArray([_enemy_path]))
	assert_eq(_argument_count(_loaded, "take_damage"), 2)
	assert_eq(_loaded.new().take_damage(3, "spikes"), "3 from spikes")


func test_leaves_an_unchanged_script_alone() -> void:
	assert_eq(GodotMcpChangedScriptReloader.reload_changed(PackedStringArray([_enemy_path]), PackedStringArray()), PackedStringArray())


func test_leaves_scripts_open_in_the_script_editor_to_it() -> void:
	_write(_enemy_path, TWO_ARGUMENTS)

	var reloaded := GodotMcpChangedScriptReloader.reload_changed(PackedStringArray([_enemy_path]), PackedStringArray([_enemy_path]))

	assert_eq(reloaded, PackedStringArray())
	assert_eq(_argument_count(_loaded, "take_damage"), 1)


func test_skips_scripts_that_nothing_has_loaded() -> void:
	var unloaded_path := FOLDER + "/unloaded.gd"
	_write(unloaded_path, ONE_ARGUMENT)

	assert_eq(GodotMcpChangedScriptReloader.reload_changed(PackedStringArray([unloaded_path]), PackedStringArray()), PackedStringArray())
	DirAccess.remove_absolute(unloaded_path)


func test_lists_the_scripts_of_the_project_outside_addons_and_dot_folders() -> void:
	var paths := GodotMcpChangedScriptReloader.project_scripts("res://")

	assert_has(paths, "res://tests/unit/editor/test_changed_script_reloader.gd")
	assert_false(Array(paths).any(func(path: String) -> bool: return path.begins_with("res://addons/") or path.begins_with("res://.godot/")))
