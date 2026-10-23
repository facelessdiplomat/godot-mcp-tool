extends RefCounted

const EDITOR_DOCK_CLASS := &"EditorDock"
const BOTTOM_SLOT_CONSTANT := &"DOCK_SLOT_BOTTOM"

var _plugin: EditorPlugin
var _content: Control
var _editor_dock: Control


func _init(plugin: EditorPlugin, content: Control) -> void:
	_plugin = plugin
	_content = content


func add(title: String) -> void:
	if ClassDB.class_exists(EDITOR_DOCK_CLASS):
		_editor_dock = ClassDB.instantiate(EDITOR_DOCK_CLASS)
		_editor_dock.set(&"title", title)
		_editor_dock.set(&"default_slot", ClassDB.class_get_integer_constant(EDITOR_DOCK_CLASS, BOTTOM_SLOT_CONSTANT))
		_editor_dock.add_child(_content)
		_plugin.call(&"add_dock", _editor_dock)
	else:
		_plugin.call(&"add_control_to_bottom_panel", _content, title)


func remove() -> void:
	if _editor_dock != null:
		_plugin.call(&"remove_dock", _editor_dock)
		_editor_dock.queue_free()
		_editor_dock = null
	else:
		_plugin.call(&"remove_control_from_bottom_panel", _content)
		_content.queue_free()
