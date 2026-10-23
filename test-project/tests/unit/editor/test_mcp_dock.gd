extends GutTest

const CommandJournal := preload("res://addons/godot_mcp_tool/editor/command_journal.gd")
const McpDock := preload("res://addons/godot_mcp_tool/editor/mcp_dock.gd")

var _journal: CommandJournal
var _status: Dictionary
var _unsafe_tools_allowed := false
var _dock: McpDock


func before_each() -> void:
	_journal = CommandJournal.new(func() -> String: return "12:03:41")
	_status = {"bridge": "listening on 127.0.0.1:50731", "clients": 1, "game": "running"}
	_unsafe_tools_allowed = false
	_dock = McpDock.new(
		_journal,
		func() -> Dictionary: return _status,
		func() -> bool: return _unsafe_tools_allowed,
		func(allowed: bool) -> void: _unsafe_tools_allowed = allowed)
	add_child_autofree(_dock)


func test_is_named_for_its_tab() -> void:
	assert_eq(_dock.name, "Godot MCP")


func test_shows_the_bridge_the_clients_and_the_game() -> void:
	assert_eq(_dock.status_text(), "Bridge: listening on 127.0.0.1:50731\nMCP clients: 1 connected\nGame: running")


func test_shows_the_latest_status_when_it_refreshes() -> void:
	_status = {"bridge": "off: the editor in process 4100 already serves this project", "clients": 0, "game": "stopped"}
	_dock.refresh()
	assert_eq(_dock.status_text(), "Bridge: off: the editor in process 4100 already serves this project\nMCP clients: none connected\nGame: stopped")


func test_turns_the_unsafe_tools_of_the_project_on_and_off() -> void:
	assert_false(_dock.unsafe_tools_toggle().button_pressed)
	_dock.unsafe_tools_toggle().button_pressed = true
	assert_true(_unsafe_tools_allowed)
	_dock.unsafe_tools_toggle().button_pressed = false
	assert_false(_unsafe_tools_allowed)


func test_follows_a_change_of_the_unsafe_tools_made_elsewhere() -> void:
	_unsafe_tools_allowed = true
	_dock.refresh()
	assert_true(_dock.unsafe_tools_toggle().button_pressed)


func test_lists_the_recent_commands_with_their_errors() -> void:
	_journal.record("scene.open", "", 5)
	_journal.record("node.add", "Node not found: Player/Gun", 3)
	assert_eq(_dock.command_lines(), ["12:03:41  node_add  failed: Node not found: Player/Gun", "12:03:41  scene_open  5 ms"])


func test_shows_error_messages_in_full_and_lets_them_be_copied() -> void:
	var long_message := "Node not found: Player/Weapons/Gun. Similar: Player/Weapons/GunMount, Player/Weapons/Sword"
	_journal.record("node.set_properties", long_message, 3)
	assert_eq(_dock.command_lines(), ["12:03:41  node_set_properties  failed: %s" % long_message])
	assert_true(_dock.commands_view().selection_enabled)
	assert_eq(_dock.commands_view().autowrap_mode, TextServer.AUTOWRAP_WORD_SMART)


func test_clears_the_list_of_commands() -> void:
	_journal.record("scene.open", "", 5)
	_dock.clear_button().pressed.emit()
	assert_eq(_dock.command_lines(), [])
