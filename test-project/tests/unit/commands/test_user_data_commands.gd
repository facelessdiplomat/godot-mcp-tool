extends GutTest

const FakeFileTrash := preload("res://tests/support/fake_file_trash.gd")
const GodotMcpCommandError := preload("res://addons/godot_mcp_tool/commands/command_error.gd")
const GodotMcpJsonRpc := preload("res://addons/godot_mcp_tool/bridge/json_rpc.gd")
const GodotMcpUserDataDeleteCommand := preload("res://addons/godot_mcp_tool/commands/project/user_data_delete_command.gd")
const GodotMcpUserDataGetCommand := preload("res://addons/godot_mcp_tool/commands/project/user_data_get_command.gd")
const ScratchFolder := preload("res://tests/support/scratch_folder.gd")

const FOLDER := "user://mcp_user_data_test"
const SAVE_TEXT := "{\"best\": 42}"

var _trash: FakeFileTrash


func before_each() -> void:
	ScratchFolder.remove(ProjectSettings.globalize_path(FOLDER))
	DirAccess.make_dir_recursive_absolute(FOLDER + "/slots")
	_write_text(FOLDER + "/save.json", SAVE_TEXT)
	var slot := FileAccess.open(FOLDER + "/slots/slot1.dat", FileAccess.WRITE)
	slot.store_buffer(PackedByteArray([0, 1, 2, 255]))
	slot.close()
	_trash = FakeFileTrash.new()


func after_each() -> void:
	ScratchFolder.remove(ProjectSettings.globalize_path(FOLDER))


func _write_text(path: String, text: String) -> void:
	var file := FileAccess.open(path, FileAccess.WRITE)
	file.store_string(text)
	file.close()


func _read_user_data(params: Dictionary) -> Variant:
	return await GodotMcpUserDataGetCommand.new().execute(params)


func _delete_user_data(params: Dictionary) -> Variant:
	return await GodotMcpUserDataDeleteCommand.new(_trash).execute(params)


func test_lists_the_files_of_a_folder_with_their_sizes() -> void:
	var result: Dictionary = await _read_user_data({"path": FOLDER})
	assert_eq(result["kind"], "folder")
	assert_eq(result["folder"], OS.get_user_data_dir())
	var sizes := {}
	for entry in result["entries"]:
		sizes[entry["path"]] = entry["size"]
	assert_eq(sizes, {FOLDER + "/save.json": SAVE_TEXT.length(), FOLDER + "/slots/slot1.dat": 4})
	assert_false(result["more"])


func test_reads_a_text_file() -> void:
	var result: Dictionary = await _read_user_data({"path": FOLDER + "/save.json"})
	assert_eq(result["kind"], "file")
	assert_eq(result["text"], SAVE_TEXT)
	assert_eq(result["size"], SAVE_TEXT.length())
	assert_false(result["truncated"])


func test_takes_a_path_without_the_user_prefix() -> void:
	var result: Dictionary = await _read_user_data({"path": "mcp_user_data_test/save.json"})
	assert_eq(result["path"], FOLDER + "/save.json")
	assert_eq(result["text"], SAVE_TEXT)


func test_cuts_a_long_file_at_the_limit() -> void:
	_write_text(FOLDER + "/log.txt", "0123456789abcdefghij")
	var result: Dictionary = await _read_user_data({"path": FOLDER + "/log.txt", "max_bytes": 10})
	assert_eq(result["text"], "0123456789")
	assert_true(result["truncated"])
	assert_eq(result["size"], 20)


func test_names_a_binary_file_without_its_contents() -> void:
	var result: Dictionary = await _read_user_data({"path": FOLDER + "/slots/slot1.dat"})
	assert_true(result["binary"])
	assert_false(result.has("text"))


func test_explains_a_missing_file() -> void:
	var error: GodotMcpCommandError = await _read_user_data({"path": FOLDER + "/missing.json"})
	assert_eq(error.code, GodotMcpJsonRpc.NOT_FOUND)


func test_refuses_paths_outside_the_user_folder() -> void:
	for path in ["res://project.godot", "user://../escape.txt"]:
		var error: GodotMcpCommandError = await _read_user_data({"path": path})
		assert_eq(error.code, GodotMcpJsonRpc.INVALID_PARAMS, path)


func test_moves_files_and_folders_to_the_trash() -> void:
	var result: Dictionary = await _delete_user_data({"paths": [FOLDER + "/save.json", FOLDER + "/slots", FOLDER + "/missing.json"]})
	assert_eq(result["deleted"], [FOLDER + "/save.json", FOLDER + "/slots"])
	assert_eq(result["missing"], [FOLDER + "/missing.json"])
	assert_eq(_trash.trashed, PackedStringArray([ProjectSettings.globalize_path(FOLDER + "/save.json"), ProjectSettings.globalize_path(FOLDER + "/slots")]))
	assert_false(FileAccess.file_exists(FOLDER + "/save.json"))


func test_refuses_to_delete_the_whole_user_folder() -> void:
	var error: GodotMcpCommandError = await _delete_user_data({"paths": ["user://"]})
	assert_eq(error.code, GodotMcpJsonRpc.INVALID_PARAMS)
	assert_eq(_trash.trashed.size(), 0)
