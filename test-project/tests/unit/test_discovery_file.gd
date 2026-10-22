extends GutTest

const DiscoveryFile := preload("res://addons/godot_mcp_tool/bridge/discovery_file.gd")
const ScratchFolder := preload("res://tests/support/scratch_folder.gd")

const GROUP_AND_OTHER_PERMISSIONS := (
	FileAccess.UNIX_READ_GROUP | FileAccess.UNIX_WRITE_GROUP | FileAccess.UNIX_EXECUTE_GROUP
	| FileAccess.UNIX_READ_OTHER | FileAccess.UNIX_WRITE_OTHER | FileAccess.UNIX_EXECUTE_OTHER
)

var _sandbox_directory := ""


func before_each() -> void:
	_sandbox_directory = OS.get_user_data_dir().path_join("discovery_tests").path_join(str(Time.get_ticks_usec()))


func after_each() -> void:
	ScratchFolder.remove(_sandbox_directory)


func test_writes_the_record_as_json_and_creates_missing_folders() -> void:
	var discovery_file := DiscoveryFile.new(_sandbox_directory.path_join("nested/bridge.json"))
	assert_eq(discovery_file.write({"port": 50731, "token": "secret"}), OK)
	var content := FileAccess.get_file_as_string(discovery_file.path)
	assert_eq_deep(JSON.parse_string(content), {"port": 50731.0, "token": "secret"})


func test_replaces_an_existing_file() -> void:
	var discovery_file := DiscoveryFile.new(_sandbox_directory.path_join("bridge.json"))
	discovery_file.write({"port": 1})
	discovery_file.write({"port": 2})
	assert_eq_deep(JSON.parse_string(FileAccess.get_file_as_string(discovery_file.path)), {"port": 2.0})


func test_keeps_the_file_private_to_its_owner() -> void:
	if OS.get_name() == "Windows":
		pass_test("Unix permissions do not apply on Windows")
		return
	var discovery_file := DiscoveryFile.new(_sandbox_directory.path_join("bridge.json"))
	discovery_file.write({"token": "secret"})
	assert_eq(FileAccess.get_unix_permissions(discovery_file.path) & GROUP_AND_OTHER_PERMISSIONS, 0)


func test_removes_the_file() -> void:
	var discovery_file := DiscoveryFile.new(_sandbox_directory.path_join("bridge.json"))
	discovery_file.write({"port": 1})
	discovery_file.remove()
	assert_false(FileAccess.file_exists(discovery_file.path))


func test_removing_a_missing_file_is_harmless() -> void:
	var discovery_file := DiscoveryFile.new(_sandbox_directory.path_join("bridge.json"))
	discovery_file.remove()
	assert_false(FileAccess.file_exists(discovery_file.path))
