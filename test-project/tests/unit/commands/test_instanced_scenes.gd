extends GutTest

const FakeSceneAccess := preload("res://tests/support/fake_scene_access.gd")
const FakeScriptEditorAccess := preload("res://tests/support/fake_script_editor_access.gd")
const GodotMcpAnimationDeleteCommand := preload("res://addons/godot_mcp_tool/commands/animation/animation_delete_command.gd")
const GodotMcpAnimationSetCommand := preload("res://addons/godot_mcp_tool/commands/animation/animation_set_command.gd")
const GodotMcpAnimationTreeSetCommand := preload("res://addons/godot_mcp_tool/commands/animation/animation_tree_set_command.gd")
const GodotMcpCommandError := preload("res://addons/godot_mcp_tool/commands/command_error.gd")
const GodotMcpEditingContext := preload("res://addons/godot_mcp_tool/scene/editing_context.gd")
const GodotMcpJsonRpc := preload("res://addons/godot_mcp_tool/bridge/json_rpc.gd")
const GodotMcpNavigationBakeCommand := preload("res://addons/godot_mcp_tool/commands/navigation/navigation_bake_command.gd")
const GodotMcpNodeAddCommand := preload("res://addons/godot_mcp_tool/commands/node/node_add_command.gd")
const GodotMcpNodeCallMethodCommand := preload("res://addons/godot_mcp_tool/commands/node/node_call_method_command.gd")
const GodotMcpNodeDuplicateCommand := preload("res://addons/godot_mcp_tool/commands/node/node_duplicate_command.gd")
const GodotMcpNodeFindCommand := preload("res://addons/godot_mcp_tool/commands/node/node_find_command.gd")
const GodotMcpNodeMakeLocalCommand := preload("res://addons/godot_mcp_tool/commands/node/node_make_local_command.gd")
const GodotMcpNodeSaveAsSceneCommand := preload("res://addons/godot_mcp_tool/commands/node/node_save_as_scene_command.gd")
const GodotMcpNodeSetGroupsCommand := preload("res://addons/godot_mcp_tool/commands/node/node_set_groups_command.gd")
const GodotMcpNodeSetPropertiesCommand := preload("res://addons/godot_mcp_tool/commands/node/node_set_properties_command.gd")
const GodotMcpPlainUndoHistory := preload("res://addons/godot_mcp_tool/scene/plain_undo_history.gd")
const GodotMcpSceneBatchEditCommand := preload("res://addons/godot_mcp_tool/commands/scene/scene_batch_edit_command.gd")
const GodotMcpSceneGetTreeCommand := preload("res://addons/godot_mcp_tool/commands/scene/scene_get_tree_command.gd")
const GodotMcpSignalConnectCommand := preload("res://addons/godot_mcp_tool/commands/signal/signal_connect_command.gd")
const GodotMcpSignalDisconnectCommand := preload("res://addons/godot_mcp_tool/commands/signal/signal_disconnect_command.gd")
const GodotMcpSignalListCommand := preload("res://addons/godot_mcp_tool/commands/signal/signal_list_command.gd")
const GodotMcpVariantCodec := preload("res://addons/godot_mcp_tool/codec/variant_codec.gd")
const ScratchProject := preload("res://tests/support/scratch_project.gd")

const MESH_VISIBILITY_CONNECTION := "Robot/Mesh:visibility_changed -> .:_on_mesh_visibility_changed"

var _scratch: ScratchProject
var _scenes: FakeSceneAccess
var _history: GodotMcpPlainUndoHistory
var _context: GodotMcpEditingContext
var _root: Node3D


func before_all() -> void:
	_scratch = ScratchProject.new()
	_scratch.write_text("robot.gd", "extends Node3D\n\n\nfunc _on_sensor_body_entered(_body: Node3D) -> void:\n\tpass\n")
	_scratch.write_text("arena.gd", "extends Node3D\n\n\nfunc _on_mesh_visibility_changed() -> void:\n\tpass\n")
	_save(_build_robot(), "robot.tscn")
	_save(_build_squad(), "squad.tscn")


func after_all() -> void:
	_scratch.remove()


func before_each() -> void:
	_scenes = FakeSceneAccess.new()
	_root = Node3D.new()
	_root.name = "Arena"
	_root.scene_file_path = _scratch.path("arena.tscn")
	_root.set_script(load(_scratch.path("arena.gd")))
	_scenes.edited_root = _root
	add_child(_root)
	_history = GodotMcpPlainUndoHistory.new()
	_context = GodotMcpEditingContext.new(_scenes, _history, GodotMcpVariantCodec.new(), FakeScriptEditorAccess.new())
	_place("robot.tscn", "Robot")


func after_each() -> void:
	_history.dispose()
	_scenes.release()


func test_a_property_change_inside_an_instance_is_saved_with_the_scene() -> void:
	var result: Dictionary = await GodotMcpNodeSetPropertiesCommand.new(_context).execute({"path": "Robot/Mesh", "properties": {"visible": false}})
	assert_eq(result["applied"], ["visible"])
	assert_eq(_saved_properties("Robot/Mesh").get("visible"), false)


func test_turns_on_editable_children_of_the_instance_and_reports_it() -> void:
	var result: Dictionary = await GodotMcpNodeSetPropertiesCommand.new(_context).execute({"path": "Robot/Mesh", "properties": {"visible": false}})
	assert_eq(result["editable_children"], ["Robot"])
	assert_true(_root.is_editable_instance(_root.get_node("Robot")))


func test_undo_turns_editable_children_off_with_the_change() -> void:
	var robot := _root.get_node("Robot")
	await GodotMcpNodeSetPropertiesCommand.new(_context).execute({"path": "Robot/Mesh", "properties": {"visible": false}})
	assert_true(_history.undo())
	assert_false(_root.is_editable_instance(robot))
	assert_true((robot.get_node("Mesh") as MeshInstance3D).visible)


func test_leaves_editable_children_that_were_on_already() -> void:
	var robot := _root.get_node("Robot")
	_root.set_editable_instance(robot, true)
	var result: Dictionary = await GodotMcpNodeSetPropertiesCommand.new(_context).execute({"path": "Robot/Mesh", "properties": {"visible": false}})
	assert_eq(result["editable_children"], [])
	assert_true(_history.undo())
	assert_true(_root.is_editable_instance(robot))


func test_a_node_of_the_scene_itself_needs_no_editable_children() -> void:
	var result: Dictionary = await GodotMcpNodeSetPropertiesCommand.new(_context).execute({"path": "Robot", "properties": {"visible": false}})
	assert_eq(result["editable_children"], [])
	assert_false(_root.is_editable_instance(_root.get_node("Robot")))


func test_rejected_values_leave_editable_children_off() -> void:
	var result: Dictionary = await GodotMcpNodeSetPropertiesCommand.new(_context).execute({"path": "Robot/Mesh", "properties": {"visibel": false}})
	assert_eq(result["editable_children"], [])
	assert_false(_root.is_editable_instance(_root.get_node("Robot")))


func test_turns_on_editable_children_of_nested_instances_down_to_the_node() -> void:
	var squad := _place("squad.tscn", "Squad")
	var result: Dictionary = await GodotMcpNodeSetPropertiesCommand.new(_context).execute({"path": "Squad/Leader/Mesh", "properties": {"visible": false}})
	assert_eq(result["editable_children"], ["Squad", "Squad/Leader"])
	assert_true(_root.is_editable_instance(squad))
	assert_true(_root.is_editable_instance(squad.get_node("Leader")))
	assert_eq(_saved_properties("Squad/Leader/Mesh").get("visible"), false)


func test_groups_of_a_node_inside_an_instance_are_saved() -> void:
	var result: Dictionary = await GodotMcpNodeSetGroupsCommand.new(_context).execute({"path": "Robot/Mesh", "add": ["targets"]})
	assert_eq(result["editable_children"], ["Robot"])
	assert_has(_saved_groups("Robot/Mesh"), "targets")


func test_a_connection_from_a_node_inside_an_instance_is_saved() -> void:
	var result: Dictionary = await GodotMcpSignalConnectCommand.new(_context).execute({"from": "Robot/Mesh", "signal": "visibility_changed", "method": "_on_mesh_visibility_changed"})
	assert_eq(result["editable_children"], ["Robot"])
	assert_has(_saved_connections(), MESH_VISIBILITY_CONNECTION)


func test_a_node_added_inside_an_instance_is_saved() -> void:
	var result: Dictionary = await GodotMcpNodeAddCommand.new(_context).execute({"parent": "Robot/Mesh", "type": "Node3D", "name": "Marker"})
	assert_eq(result["editable_children"], ["Robot"])
	assert_has(_saved_node_paths(), "Robot/Mesh/Marker")


func test_a_node_added_under_an_instance_root_needs_no_editable_children() -> void:
	var result: Dictionary = await GodotMcpNodeAddCommand.new(_context).execute({"parent": "Robot", "type": "Node3D", "name": "Marker"})
	assert_eq(result["editable_children"], [])
	assert_has(_saved_node_paths(), "Robot/Marker")


func test_a_batch_turns_editable_children_on_once_and_undoes_it_with_the_batch() -> void:
	var robot := _root.get_node("Robot")
	var result: Dictionary = await GodotMcpSceneBatchEditCommand.new(_context).execute({"operations": [
		{"op": "node_set_properties", "path": "Robot/Mesh", "properties": {"visible": false}},
		{"op": "node_set_groups", "path": "Robot/Mesh", "add": ["targets"]},
	]})
	var results: Array = result["results"]
	assert_eq((results[0] as Dictionary)["editable_children"], ["Robot"])
	assert_eq((results[1] as Dictionary)["editable_children"], [])
	assert_eq(_saved_properties("Robot/Mesh").get("visible"), false)
	assert_true(_history.undo())
	assert_false(_root.is_editable_instance(robot))


func test_a_failed_batch_leaves_editable_children_off() -> void:
	var error: Variant = await GodotMcpSceneBatchEditCommand.new(_context).execute({"operations": [
		{"op": "node_set_properties", "path": "Robot/Mesh", "properties": {"visible": false}},
		{"op": "node_set_properties", "path": "Missing", "properties": {"visible": false}},
	]})
	assert_true(error is GodotMcpCommandError)
	assert_false(_root.is_editable_instance(_root.get_node("Robot")))


func test_a_method_call_inside_an_instance_is_saved() -> void:
	var robot := _root.get_node("Robot")
	var result: Dictionary = await GodotMcpNodeCallMethodCommand.new(_context).execute({"path": "Robot/Mesh", "method": "rotate_y", "args": [1.0]})
	assert_eq(result["editable_children"], ["Robot"])
	assert_true(_saved_properties("Robot/Mesh").has("transform"))
	assert_true(_history.undo())
	assert_false(_root.is_editable_instance(robot))


func test_refuses_to_change_the_animations_of_a_player_inside_an_instance() -> void:
	var error: Variant = await GodotMcpAnimationSetCommand.new(_context).execute({
		"player": "Robot/AnimationPlayer",
		"name": "wave",
		"tracks": [{"path": "Mesh:visible", "keys": [{"time": 0, "value": true}]}],
	})
	_assert_refused_for_the_robot_scene(error)
	assert_false((_root.get_node("Robot/AnimationPlayer") as AnimationPlayer).has_animation("wave"))


func test_refuses_to_delete_an_animation_of_a_player_inside_an_instance() -> void:
	var error: Variant = await GodotMcpAnimationDeleteCommand.new(_context).execute({"player": "Robot/AnimationPlayer", "name": "wave"})
	_assert_refused_for_the_robot_scene(error)


func test_refuses_to_set_up_an_animation_tree_inside_an_instance() -> void:
	var error: Variant = await GodotMcpAnimationTreeSetCommand.new(_context).execute({
		"tree": "Robot/AnimationTree",
		"player": "Robot/AnimationPlayer",
		"states": [{"name": "idle", "animation": "idle"}],
	})
	_assert_refused_for_the_robot_scene(error)


func test_refuses_to_bake_a_navigation_region_inside_an_instance() -> void:
	var error: Variant = await GodotMcpNavigationBakeCommand.new(_context).execute({"path": "Robot/Navigation"})
	_assert_refused_for_the_robot_scene(error)


func test_refuses_to_disconnect_a_connection_that_the_instanced_scene_makes() -> void:
	var robot := _root.get_node("Robot")
	var error: Variant = await GodotMcpSignalDisconnectCommand.new(_context).execute({"from": "Robot/Sensor", "signal": "body_entered", "to": "Robot", "method": "_on_sensor_body_entered"})
	_assert_refused_for_the_robot_scene(error)
	assert_true((robot.get_node("Sensor") as Area3D).body_entered.is_connected(Callable(robot, "_on_sensor_body_entered")))


func test_disconnects_a_connection_that_this_scene_made_inside_an_instance() -> void:
	await GodotMcpSignalConnectCommand.new(_context).execute({"from": "Robot/Mesh", "signal": "visibility_changed", "method": "_on_mesh_visibility_changed"})
	var result: Variant = await GodotMcpSignalDisconnectCommand.new(_context).execute({"from": "Robot/Mesh", "signal": "visibility_changed", "method": "_on_mesh_visibility_changed"})
	assert_false(result is GodotMcpCommandError)
	assert_does_not_have(_saved_connections(), MESH_VISIBILITY_CONNECTION)


func test_the_tree_hides_the_nodes_of_an_instance_and_says_so() -> void:
	var result: Dictionary = await GodotMcpSceneGetTreeCommand.new(_context).execute({})
	var robot := _child_named(result["root"], "Robot")
	assert_false(robot.has("children"))
	assert_false(robot.has("editable_children"))
	assert_true(result["hidden_instance_nodes"])


func test_the_tree_shows_the_nodes_of_an_instance_with_editable_children() -> void:
	_root.set_editable_instance(_root.get_node("Robot"), true)
	var result: Dictionary = await GodotMcpSceneGetTreeCommand.new(_context).execute({})
	var robot := _child_named(result["root"], "Robot")
	assert_true(robot["editable_children"])
	assert_eq(_names_of(robot["children"]), ["Mesh", "AnimationPlayer", "AnimationTree", "Navigation", "Sensor"])
	assert_false(result["hidden_instance_nodes"])


func test_the_tree_expands_every_instance_when_asked() -> void:
	_place("squad.tscn", "Squad")
	var result: Dictionary = await GodotMcpSceneGetTreeCommand.new(_context).execute({"expand_instances": true})
	var leader := _child_named(_child_named(result["root"], "Squad"), "Leader")
	assert_has(_names_of(leader["children"]), "Mesh")
	assert_false(result["hidden_instance_nodes"])


func test_find_searches_inside_instances_only_when_asked() -> void:
	var shallow: Dictionary = await GodotMcpNodeFindCommand.new(_context).execute({"type": "MeshInstance3D"})
	var deep: Dictionary = await GodotMcpNodeFindCommand.new(_context).execute({"type": "MeshInstance3D", "expand_instances": true})
	assert_eq(shallow["total"], 0)
	assert_true(shallow["hidden_instance_nodes"])
	assert_eq((deep["matches"] as Array).map(func(found: Dictionary) -> String: return found["path"]), ["Robot/Mesh"])


func test_the_saved_connections_leave_out_those_that_the_instanced_scene_makes() -> void:
	await GodotMcpSignalConnectCommand.new(_context).execute({"from": "Robot/Mesh", "signal": "visibility_changed", "method": "_on_mesh_visibility_changed"})
	var listed: Dictionary = await GodotMcpSignalListCommand.new(_context).execute({})
	var sources: Array = (listed["connections"] as Array).map(func(connection: Dictionary) -> String: return "%s.%s" % [connection["from"], connection["signal"]])
	assert_eq(sources, ["Robot/Mesh.visibility_changed"])


func test_the_signals_of_a_node_mark_the_connections_that_the_instanced_scene_makes() -> void:
	var listed: Dictionary = await GodotMcpSignalListCommand.new(_context).execute({"path": "Robot/Sensor"})
	var body_entered: Dictionary = (listed["signals"] as Array).filter(func(entry: Dictionary) -> bool: return entry["name"] == "body_entered")[0]
	assert_eq(((body_entered["connections"] as Array)[0] as Dictionary).get("inherited"), true)


func test_saves_a_branch_as_a_scene_and_puts_an_instance_in_its_place() -> void:
	var enemy := _build_enemy_branch()
	var file := _scratch.path("saved/enemy.tscn")
	var result: Dictionary = await GodotMcpNodeSaveAsSceneCommand.new(_context).execute({"path": "Enemy", "file": file})
	var instance := _root.get_node("Enemy") as Node3D
	assert_eq(result["path"], "Enemy")
	assert_eq(result["file"], file)
	assert_eq(result["node_count"], 2)
	assert_ne(instance, enemy)
	assert_eq(instance.scene_file_path, file)
	assert_eq(instance.owner, _root)
	assert_eq(instance.get_index(), 1)
	assert_eq(instance.position, Vector3(5, 0, 0))
	assert_eq(instance.get_node("Mesh").owner, instance)
	assert_true(instance.is_in_group("enemies"))
	var saved_root := (load(file) as PackedScene).instantiate() as Node3D
	assert_eq(saved_root.position, Vector3.ZERO)
	assert_not_null(saved_root.get_node_or_null("Mesh"))
	saved_root.free()


func test_undo_puts_the_branch_back() -> void:
	var enemy := _build_enemy_branch()
	await GodotMcpNodeSaveAsSceneCommand.new(_context).execute({"path": "Enemy", "file": _scratch.path("saved/undone.tscn")})
	assert_true(_history.undo())
	assert_eq(_root.get_node("Enemy"), enemy)
	assert_eq(enemy.scene_file_path, "")
	assert_eq(enemy.get_node("Mesh").owner, _root)


func test_a_saved_branch_keeps_the_changes_inside_its_instances() -> void:
	var holder := _own(_root, _root, Node3D.new(), "Holder")
	var robot := _own(_root, holder, (load(_scratch.path("robot.tscn")) as PackedScene).instantiate(PackedScene.GEN_EDIT_STATE_INSTANCE), "Robot")
	await GodotMcpNodeSetPropertiesCommand.new(_context).execute({"path": "Holder/Robot/Mesh", "properties": {"visible": false}})
	var file := _scratch.path("saved/holder.tscn")
	await GodotMcpNodeSaveAsSceneCommand.new(_context).execute({"path": "Holder", "file": file})
	var saved_holder := (load(file) as PackedScene).instantiate(PackedScene.GEN_EDIT_STATE_INSTANCE)
	assert_false((saved_holder.get_node("Robot/Mesh") as MeshInstance3D).visible)
	saved_holder.free()
	assert_false(is_instance_valid(robot) and robot.is_inside_tree())


func test_refuses_to_save_a_branch_over_an_existing_file() -> void:
	_build_enemy_branch()
	var error: Variant = await GodotMcpNodeSaveAsSceneCommand.new(_context).execute({"path": "Enemy", "file": _scratch.path("robot.tscn")})
	assert_true(error is GodotMcpCommandError)
	assert_eq((error as GodotMcpCommandError).code, GodotMcpJsonRpc.INVALID_PARAMS)


func test_a_failed_batch_removes_the_scene_file_it_wrote() -> void:
	var enemy := _build_enemy_branch()
	var file := _scratch.path("saved/abandoned.tscn")
	var error: Variant = await GodotMcpSceneBatchEditCommand.new(_context).execute({"operations": [
		{"op": "node_save_as_scene", "path": "Enemy", "file": file},
		{"op": "node_set_properties", "path": "Missing", "properties": {"visible": false}},
	]})
	assert_true(error is GodotMcpCommandError)
	assert_false(FileAccess.file_exists(file))
	assert_eq(_root.get_node("Enemy"), enemy)


func test_makes_an_instance_local() -> void:
	var robot := _root.get_node("Robot")
	var result: Dictionary = await GodotMcpNodeMakeLocalCommand.new(_context).execute({"path": "Robot"})
	assert_eq(result["scene_file"], _scratch.path("robot.tscn"))
	assert_eq(result["taken_over"], 5)
	assert_eq(robot.scene_file_path, "")
	assert_eq(robot.get_node("Mesh").owner, _root)
	assert_has(_saved_node_paths(), "Robot/Mesh")
	assert_has(_saved_connections(), "Robot/Sensor:body_entered -> Robot:_on_sensor_body_entered")


func test_undo_turns_a_local_copy_back_into_an_instance() -> void:
	var robot := _root.get_node("Robot")
	await GodotMcpNodeMakeLocalCommand.new(_context).execute({"path": "Robot"})
	assert_true(_history.undo())
	assert_eq(robot.scene_file_path, _scratch.path("robot.tscn"))
	assert_eq(robot.get_node("Mesh").owner, robot)
	assert_does_not_have(_saved_connections(), "Robot/Sensor:body_entered -> Robot:_on_sensor_body_entered")


func test_refuses_to_make_a_node_of_the_scene_local() -> void:
	_build_enemy_branch()
	var error: Variant = await GodotMcpNodeMakeLocalCommand.new(_context).execute({"path": "Enemy"})
	assert_true(error is GodotMcpCommandError)
	assert_eq((error as GodotMcpCommandError).code, GodotMcpJsonRpc.INVALID_PARAMS)


func test_a_duplicated_instance_saves_no_connection_that_its_scene_makes() -> void:
	await GodotMcpNodeDuplicateCommand.new(_context).execute({"path": "Robot", "name": "Robot2"})
	assert_does_not_have(_saved_connections(), "Robot2/Sensor:body_entered -> Robot2:_on_sensor_body_entered")
	assert_false(_saved_properties("Robot2").has("script"))


func _build_enemy_branch() -> Node3D:
	var enemy := _own(_root, _root, Node3D.new(), "Enemy") as Node3D
	enemy.position = Vector3(5, 0, 0)
	enemy.add_to_group("enemies", true)
	(_own(_root, enemy, MeshInstance3D.new(), "Mesh") as MeshInstance3D).mesh = BoxMesh.new()
	return enemy


static func _child_named(description: Dictionary, child_name: String) -> Dictionary:
	for child: Dictionary in description.get("children", []):
		if child["name"] == child_name:
			return child
	return {}


static func _names_of(descriptions: Array) -> Array:
	return descriptions.map(func(description: Dictionary) -> String: return description["name"])


func _assert_refused_for_the_robot_scene(error: Variant) -> void:
	assert_true(error is GodotMcpCommandError, "expected a refusal")
	if not error is GodotMcpCommandError:
		return
	assert_eq((error as GodotMcpCommandError).code, GodotMcpJsonRpc.INVALID_PARAMS)
	assert_string_contains((error as GodotMcpCommandError).message, _scratch.path("robot.tscn"))
	assert_string_contains((error as GodotMcpCommandError).hint, "scene: \"%s\"" % _scratch.path("robot.tscn"))


func _build_robot() -> Node3D:
	var robot := Node3D.new()
	robot.name = "Robot"
	robot.set_script(load(_scratch.path("robot.gd")))
	(_own(robot, robot, MeshInstance3D.new(), "Mesh") as MeshInstance3D).mesh = BoxMesh.new()
	_own(robot, robot, AnimationPlayer.new(), "AnimationPlayer")
	_own(robot, robot, AnimationTree.new(), "AnimationTree")
	(_own(robot, robot, NavigationRegion3D.new(), "Navigation") as NavigationRegion3D).navigation_mesh = NavigationMesh.new()
	var sensor := _own(robot, robot, Area3D.new(), "Sensor") as Area3D
	sensor.body_entered.connect(Callable(robot, "_on_sensor_body_entered"), CONNECT_PERSIST)
	return robot


func _build_squad() -> Node3D:
	var squad := Node3D.new()
	squad.name = "Squad"
	_own(squad, squad, (load(_scratch.path("robot.tscn")) as PackedScene).instantiate(PackedScene.GEN_EDIT_STATE_INSTANCE), "Leader")
	return squad


func _place(file_name: String, node_name: String) -> Node:
	return _own(_root, _root, (load(_scratch.path(file_name)) as PackedScene).instantiate(PackedScene.GEN_EDIT_STATE_INSTANCE), node_name)


func _save(scene_root: Node, file_name: String) -> void:
	var scene := PackedScene.new()
	scene.pack(scene_root)
	scene_root.free()
	ResourceSaver.save(scene, _scratch.path(file_name))


func _saved_state() -> SceneState:
	var scene := PackedScene.new()
	scene.pack(_root)
	return scene.get_state()


func _saved_node_paths() -> PackedStringArray:
	var state := _saved_state()
	var paths := PackedStringArray()
	for index in state.get_node_count():
		paths.append(_relative(state.get_node_path(index)))
	return paths


func _saved_properties(node_path: String) -> Dictionary:
	var state := _saved_state()
	var properties := {}
	for index in state.get_node_count():
		if _relative(state.get_node_path(index)) != node_path:
			continue
		for property_index in state.get_node_property_count(index):
			properties[str(state.get_node_property_name(index, property_index))] = state.get_node_property_value(index, property_index)
	return properties


func _saved_groups(node_path: String) -> PackedStringArray:
	var state := _saved_state()
	for index in state.get_node_count():
		if _relative(state.get_node_path(index)) == node_path:
			return PackedStringArray(Array(state.get_node_groups(index)).map(func(group: StringName) -> String: return str(group)))
	return PackedStringArray()


func _saved_connections() -> PackedStringArray:
	var state := _saved_state()
	var connections := PackedStringArray()
	for index in state.get_connection_count():
		connections.append("%s:%s -> %s:%s" % [
			_relative(state.get_connection_source(index)),
			state.get_connection_signal(index),
			_relative(state.get_connection_target(index)),
			state.get_connection_method(index),
		])
	return connections


static func _relative(path: NodePath) -> String:
	return str(path).trim_prefix("./")


static func _own(scene_root: Node, parent: Node, node: Node, node_name: String) -> Node:
	node.name = node_name
	parent.add_child(node)
	node.owner = scene_root
	return node
