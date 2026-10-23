@tool
extends HSplitContainer

const CommandJournal := preload("command_journal.gd")

const TAB_TITLE := "Godot MCP"
const REFRESH_INTERVAL_SECONDS := 1.0
const UNSAFE_TOOLS_TEXT := "Allow unsafe tools in this project"
const UNSAFE_TOOLS_TOOLTIP := "Lets the agent run editor_run_script, game_eval, node_call_method and filesystem_delete in this project, once its MCP server offers them (GODOT_MCP_UNSAFE=1)."
const COMMANDS_TITLE := "Recent agent commands"
const CLEAR_TEXT := "Clear"
const STATUS_COLUMN_WIDTH := 380

var _journal: CommandJournal
var _read_status: Callable
var _is_unsafe_allowed: Callable
var _set_unsafe_allowed: Callable
var _status_label := Label.new()
var _unsafe_toggle := CheckBox.new()
var _clear_button := Button.new()
var _commands := RichTextLabel.new()
var _refresh_timer := Timer.new()


func _init(journal: CommandJournal, read_status: Callable, is_unsafe_allowed: Callable, set_unsafe_allowed: Callable) -> void:
	name = TAB_TITLE
	_journal = journal
	_read_status = read_status
	_is_unsafe_allowed = is_unsafe_allowed
	_set_unsafe_allowed = set_unsafe_allowed
	_build()
	_journal.changed.connect(_show_commands)
	refresh()
	_show_commands()


func refresh() -> void:
	var status: Dictionary = _read_status.call()
	var clients: int = status.get("clients", 0)
	_status_label.text = "Bridge: %s\nMCP clients: %s\nGame: %s" % [
		status.get("bridge", ""),
		"none connected" if clients == 0 else "%d connected" % clients,
		status.get("game", ""),
	]
	_unsafe_toggle.set_pressed_no_signal(_is_unsafe_allowed.call())


func status_text() -> String:
	return _status_label.text


func unsafe_tools_toggle() -> CheckBox:
	return _unsafe_toggle


func clear_button() -> Button:
	return _clear_button


func commands_view() -> RichTextLabel:
	return _commands


func command_lines() -> Array:
	return Array(_commands.get_parsed_text().split("\n", false))


func _build() -> void:
	var status_column := VBoxContainer.new()
	status_column.custom_minimum_size.x = STATUS_COLUMN_WIDTH
	_status_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	status_column.add_child(_status_label)
	_unsafe_toggle.text = UNSAFE_TOOLS_TEXT
	_unsafe_toggle.tooltip_text = UNSAFE_TOOLS_TOOLTIP
	_unsafe_toggle.toggled.connect(_on_unsafe_toggled)
	status_column.add_child(_unsafe_toggle)
	add_child(status_column)
	var commands_column := VBoxContainer.new()
	var header := HBoxContainer.new()
	var title := Label.new()
	title.text = COMMANDS_TITLE
	title.size_flags_horizontal = SIZE_EXPAND_FILL
	header.add_child(title)
	_clear_button.text = CLEAR_TEXT
	_clear_button.pressed.connect(_journal.clear)
	header.add_child(_clear_button)
	commands_column.add_child(header)
	_commands.size_flags_vertical = SIZE_EXPAND_FILL
	_commands.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_commands.selection_enabled = true
	_commands.context_menu_enabled = true
	commands_column.add_child(_commands)
	add_child(commands_column)
	_refresh_timer.wait_time = REFRESH_INTERVAL_SECONDS
	_refresh_timer.autostart = true
	_refresh_timer.timeout.connect(refresh)
	add_child(_refresh_timer)


func _on_unsafe_toggled(allowed: bool) -> void:
	_set_unsafe_allowed.call(allowed)


func _show_commands() -> void:
	_commands.clear()
	for entry: Dictionary in _journal.entries():
		var error_message := str(entry["error"])
		if error_message.is_empty():
			_commands.add_text("%s  %s  %d ms" % [entry["time"], entry["tool"], entry["duration_msec"]])
		else:
			_commands.push_color(get_theme_color(&"error_color", &"Editor"))
			_commands.add_text("%s  %s  failed: %s" % [entry["time"], entry["tool"], error_message])
			_commands.pop()
		_commands.newline()
