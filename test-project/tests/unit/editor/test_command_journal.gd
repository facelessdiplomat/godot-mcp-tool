extends GutTest

const CommandJournal := preload("res://addons/godot_mcp_tool/editor/command_journal.gd")

var _journal: CommandJournal


func before_each() -> void:
	_journal = CommandJournal.new(func() -> String: return "12:03:41")


func _tools() -> Array:
	return _journal.entries().map(func(entry: Dictionary) -> String: return entry["tool"])


func test_records_a_command_under_the_name_of_its_tool() -> void:
	_journal.record("node.add", "", 12)
	assert_eq_deep(_journal.entries(), [{"time": "12:03:41", "tool": "node_add", "error": "", "duration_msec": 12}])


func test_lists_the_newest_command_first() -> void:
	_journal.record("scene.open", "", 5)
	_journal.record("asset.import_settings_get", "Not imported", 3)
	assert_eq(_tools(), ["asset_import_settings_get", "scene_open"])


func test_keeps_only_the_latest_commands() -> void:
	for index in CommandJournal.CAPACITY + 5:
		_journal.record("node.add" if index < CommandJournal.CAPACITY + 4 else "scene.save", "", 1)
	assert_eq(_journal.entries().size(), CommandJournal.CAPACITY)
	assert_eq(_tools()[0], "scene_save")


func test_tells_when_it_changes_and_when_it_is_cleared() -> void:
	watch_signals(_journal)
	_journal.record("node.add", "", 1)
	_journal.clear()
	assert_signal_emit_count(_journal, "changed", 2)
	assert_eq(_journal.entries(), [])
