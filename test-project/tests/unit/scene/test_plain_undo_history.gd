extends GutTest

const PlainUndoHistory := preload("res://addons/godot_mcp_tool/scene/plain_undo_history.gd")

var _history: PlainUndoHistory


func before_each() -> void:
	_history = PlainUndoHistory.new()


func after_each() -> void:
	_history.dispose()


func test_applies_and_undoes_a_property_change() -> void:
	var node: Node3D = autofree(Node3D.new())
	_history.begin("Move", node)
	_history.add_do_property(node, &"position", Vector3(1, 2, 3))
	_history.add_undo_property(node, &"position", Vector3.ZERO)
	_history.commit()
	assert_eq(node.position, Vector3(1, 2, 3))
	assert_true(_history.undo())
	assert_eq(node.position, Vector3.ZERO)


func test_applies_and_undoes_method_calls_with_arguments() -> void:
	var parent: Node3D = autofree(Node3D.new())
	var child := Node3D.new()
	_history.begin("Add child", parent)
	_history.add_do_call(parent, &"add_child", [child])
	_history.add_undo_call(parent, &"remove_child", [child])
	_history.add_do_reference(child)
	_history.commit()
	assert_eq(child.get_parent(), parent)
	assert_true(_history.undo())
	assert_null(child.get_parent())
	assert_true(_history.redo())
	assert_eq(child.get_parent(), parent)


func test_names_the_action() -> void:
	var node: Node3D = autofree(Node3D.new())
	_history.begin("MCP: Move Player", node)
	_history.add_do_property(node, &"visible", false)
	_history.add_undo_property(node, &"visible", true)
	_history.commit()
	assert_eq(_history.last_action_name(), "MCP: Move Player")
