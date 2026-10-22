extends GutTest

const ChangeSet := preload("res://addons/godot_mcp_tool/scene/change_set.gd")
const PlainUndoHistory := preload("res://addons/godot_mcp_tool/scene/plain_undo_history.gd")


class Counter:
	extends RefCounted

	var calls := 0

	func bump() -> void:
		calls += 1


var _history: PlainUndoHistory


func before_each() -> void:
	_history = PlainUndoHistory.new()


func after_each() -> void:
	_history.dispose()


func test_applies_and_reverts_its_steps_directly() -> void:
	var parent := autofree(Node3D.new()) as Node3D
	var child := autofree(Node3D.new()) as Node3D
	var changes := ChangeSet.new()
	changes.add_do_call(parent, &"add_child", [child])
	changes.add_do_property(child, &"position", Vector3(1, 2, 3))
	changes.add_undo_call(parent, &"remove_child", [child])
	changes.add_undo_property(child, &"position", Vector3.ZERO)
	changes.apply()
	assert_eq(child.get_parent(), parent)
	assert_eq(child.position, Vector3(1, 2, 3))
	changes.revert()
	assert_null(child.get_parent())
	assert_eq(child.position, Vector3.ZERO)


func test_records_change_sets_as_one_undo_action() -> void:
	var node := autofree(Node3D.new()) as Node3D
	var first := ChangeSet.new()
	first.add_do_property(node, &"position", Vector3(1, 0, 0))
	first.add_undo_property(node, &"position", Vector3.ZERO)
	var second := ChangeSet.new()
	second.add_do_property(node, &"position", Vector3(2, 0, 0))
	second.add_undo_property(node, &"position", Vector3(1, 0, 0))
	_history.record("MCP: Move twice", node, [first, second])
	assert_eq(node.position, Vector3(2, 0, 0))
	assert_eq(_history.last_action_name(), "MCP: Move twice")
	assert_true(_history.undo())
	assert_eq(node.position, Vector3.ZERO)


func test_records_steps_that_were_applied_already_without_running_them_again() -> void:
	var counter := Counter.new()
	var changes := ChangeSet.new()
	changes.add_do_call(counter, &"bump")
	changes.apply()
	_history.record("MCP: Bump", counter, [changes], false)
	assert_eq(counter.calls, 1)
	assert_true(_history.undo())
	assert_true(_history.redo())
	assert_eq(counter.calls, 2)


func test_frees_the_nodes_it_created_when_they_are_left_out() -> void:
	var parent := autofree(Node3D.new()) as Node3D
	var child := Node3D.new()
	var changes := ChangeSet.new()
	changes.add_do_call(parent, &"add_child", [child])
	changes.add_undo_call(parent, &"remove_child", [child])
	changes.add_do_reference(child)
	changes.apply()
	changes.revert()
	changes.release_created()
	assert_false(is_instance_valid(child))


func test_knows_when_it_has_no_steps() -> void:
	var changes := ChangeSet.new()
	assert_true(changes.is_empty())
	changes.add_do_property(autofree(Node3D.new()), &"visible", false)
	assert_false(changes.is_empty())
