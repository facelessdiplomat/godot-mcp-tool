extends GutTest

const DiscoveryFile := preload("res://addons/godot_mcp_tool/bridge/discovery_file.gd")
const ScratchFolder := preload("res://tests/support/scratch_folder.gd")

const GROUP_AND_OTHER_PERMISSIONS := (
	FileAccess.UNIX_READ_GROUP | FileAccess.UNIX_WRITE_GROUP | FileAccess.UNIX_EXECUTE_GROUP
	| FileAccess.UNIX_READ_OTHER | FileAccess.UNIX_WRITE_OTHER | FileAccess.UNIX_EXECUTE_OTHER
)

const OTHER_EDITOR_PID := 4100
const THIS_EDITOR_PID := 4200
const THIS_EDITOR_PORT := 4201

var _sandbox_directory := ""
var _other_bridge: TCPServer


func before_each() -> void:
	_sandbox_directory = OS.get_user_data_dir().path_join("discovery_tests").path_join(str(Time.get_ticks_usec()))
	_other_bridge = TCPServer.new()
	_other_bridge.listen(0, "127.0.0.1")


func after_each() -> void:
	_other_bridge.stop()
	ScratchFolder.remove(_sandbox_directory)


func _discovery_file() -> DiscoveryFile:
	return DiscoveryFile.new(_sandbox_directory.path_join("bridge.json"))


func _other_editor_record() -> Dictionary:
	return {"pid": OTHER_EDITOR_PID, "port": _other_bridge.get_local_port()}


func _this_editor_record() -> Dictionary:
	return {"pid": THIS_EDITOR_PID, "port": THIS_EDITOR_PORT}


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


func test_leaves_the_file_of_another_editor_alone_while_its_bridge_listens() -> void:
	var discovery_file := _discovery_file()
	discovery_file.write(_other_editor_record())
	assert_eq(discovery_file.claim(_this_editor_record()), ERR_ALREADY_IN_USE)
	assert_eq(discovery_file.owner_pid(), OTHER_EDITOR_PID)
	discovery_file.release(THIS_EDITOR_PID)
	assert_eq(discovery_file.owner_pid(), OTHER_EDITOR_PID)


func test_takes_over_the_file_of_an_editor_whose_bridge_stopped() -> void:
	var discovery_file := _discovery_file()
	discovery_file.write(_other_editor_record())
	_other_bridge.stop()
	assert_eq(discovery_file.claim(_this_editor_record()), OK)
	assert_eq(discovery_file.owner_pid(), THIS_EDITOR_PID)


func test_takes_over_its_own_file() -> void:
	var discovery_file := _discovery_file()
	discovery_file.write({"pid": THIS_EDITOR_PID, "port": _other_bridge.get_local_port()})
	assert_eq(discovery_file.claim(_this_editor_record()), OK)
	assert_eq_deep(discovery_file.read(), {"pid": float(THIS_EDITOR_PID), "port": float(THIS_EDITOR_PORT)})


func test_takes_over_a_file_whose_port_its_own_bridge_listens_on_now() -> void:
	var discovery_file := _discovery_file()
	discovery_file.write(_other_editor_record())
	assert_eq(discovery_file.claim({"pid": THIS_EDITOR_PID, "port": _other_bridge.get_local_port()}), OK)
	assert_eq(discovery_file.owner_pid(), THIS_EDITOR_PID)


func test_marks_its_own_file_as_closed_and_keeps_where_the_editor_is() -> void:
	var discovery_file := _discovery_file()
	discovery_file.claim({"pid": THIS_EDITOR_PID, "port": THIS_EDITOR_PORT, "token": "secret", "executable_path": "/opt/godot/godot"})
	discovery_file.release(OTHER_EDITOR_PID)
	assert_eq(discovery_file.owner_pid(), THIS_EDITOR_PID)
	discovery_file.release(THIS_EDITOR_PID)
	assert_eq_deep(discovery_file.read(), {"closed": true, "executable_path": "/opt/godot/godot"})
	assert_eq(discovery_file.owner_pid(), DiscoveryFile.NO_OWNER)


func test_takes_over_a_closed_file() -> void:
	var discovery_file := _discovery_file()
	discovery_file.write({"closed": true, "executable_path": "/opt/godot/godot"})
	assert_eq(discovery_file.claim(_this_editor_record()), OK)
	assert_eq(discovery_file.owner_pid(), THIS_EDITOR_PID)


func test_releasing_a_missing_file_is_harmless() -> void:
	var discovery_file := _discovery_file()
	discovery_file.release(THIS_EDITOR_PID)
	assert_false(FileAccess.file_exists(discovery_file.path))
