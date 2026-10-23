extends RefCounted

var _plugin: EditorPlugin
var _content: Control
var _editor_dock: EditorDock


func _init(plugin: EditorPlugin, content: Control) -> void:
	_plugin = plugin
	_content = content


func add(title: String) -> void:
	_editor_dock = EditorDock.new()
	_editor_dock.title = title
	_editor_dock.default_slot = EditorDock.DOCK_SLOT_BOTTOM
	_editor_dock.add_child(_content)
	_plugin.add_dock(_editor_dock)


func remove() -> void:
	if _editor_dock == null:
		return
	_plugin.remove_dock(_editor_dock)
	_editor_dock.queue_free()
	_editor_dock = null
