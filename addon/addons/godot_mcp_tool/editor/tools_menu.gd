extends RefCounted

const MENU_TITLE := "Godot MCP Tool"

var _menu: PopupMenu
var _readers: Array[Callable] = []
var _writers: Array[Callable] = []


func add_switch(text: String, is_on: Callable, set_on: Callable) -> void:
	_readers.append(is_on)
	_writers.append(set_on)
	popup_menu().add_check_item(text, _readers.size() - 1)
	_refresh()


func popup_menu() -> PopupMenu:
	if _menu == null:
		_menu = PopupMenu.new()
		_menu.id_pressed.connect(_on_item_pressed)
		_menu.about_to_popup.connect(_refresh)
	return _menu


func install(plugin: EditorPlugin) -> void:
	plugin.add_tool_submenu_item(MENU_TITLE, popup_menu())


func uninstall(plugin: EditorPlugin) -> void:
	plugin.remove_tool_menu_item(MENU_TITLE)
	free_menu()


func free_menu() -> void:
	if is_instance_valid(_menu):
		_menu.queue_free()
	_menu = null


func _refresh() -> void:
	for switch_id in _readers.size():
		_menu.set_item_checked(_menu.get_item_index(switch_id), bool(_readers[switch_id].call()))


func _on_item_pressed(switch_id: int) -> void:
	_writers[switch_id].call(not bool(_readers[switch_id].call()))
	_refresh()
