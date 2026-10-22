extends GutTest

const CommandError := preload("res://addons/godot_mcp_tool/commands/command_error.gd")
const EditingContext := preload("res://addons/godot_mcp_tool/scene/editing_context.gd")
const FakeSceneAccess := preload("res://tests/support/fake_scene_access.gd")
const FakeScriptEditorAccess := preload("res://tests/support/fake_script_editor_access.gd")
const JsonRpc := preload("res://addons/godot_mcp_tool/bridge/json_rpc.gd")
const NodeFindCommand := preload("res://addons/godot_mcp_tool/commands/node/node_find_command.gd")
const PatrolPoint := preload("res://tests/fixtures/patrol_point.gd")
const PlainUndoHistory := preload("res://addons/godot_mcp_tool/scene/plain_undo_history.gd")
const VariantCodec := preload("res://addons/godot_mcp_tool/codec/variant_codec.gd")

var _scenes: FakeSceneAccess
var _history: PlainUndoHistory
var _context: EditingContext
var _root: Node3D


func before_each() -> void:
	_scenes = FakeSceneAccess.new()
	_root = Node3D.new()
	_root.name = "Arena"
	_root.scene_file_path = "res://levels/arena.tscn"
	_scenes.edited_root = _root
	_history = PlainUndoHistory.new()
	_context = EditingContext.new(_scenes, _history, VariantCodec.new(), FakeScriptEditorAccess.new())
	var enemies := _add_owned(_root, Node3D.new(), "Enemies")
	var goblin := _add_owned(enemies, CharacterBody3D.new(), "Goblin")
	goblin.add_to_group("enemies", true)
	_add_owned(goblin, CollisionShape3D.new(), "Shape")
	var boss := _add_owned(enemies, CharacterBody3D.new(), "OrcBoss")
	boss.add_to_group("enemies", true)
	_add_owned(_root, OmniLight3D.new(), "Lamp")
	_add_owned(_root, DirectionalLight3D.new(), "Sun")
	_add_owned(_root, PatrolPoint.new(), "Waypoint")
	_add_owned(_root, (load("res://tests/fixtures/crate.tscn") as PackedScene).instantiate(PackedScene.GEN_EDIT_STATE_INSTANCE), "Crate")


func after_each() -> void:
	_history.dispose()
	_scenes.release()


func _add_owned(parent: Node, node: Node, node_name: String) -> Node:
	node.name = node_name
	parent.add_child(node)
	node.owner = _root
	return node


func _find(params: Dictionary) -> Variant:
	return await NodeFindCommand.new(_context).execute(params)


static func _paths(result: Dictionary) -> Array:
	return (result["matches"] as Array).map(func(entry: Dictionary) -> String: return entry["path"])


func test_finds_nodes_by_part_of_their_name_in_any_case() -> void:
	var result: Dictionary = await _find({"name": "orc"})
	assert_eq(result["scene"], "res://levels/arena.tscn")
	assert_eq(_paths(result), ["Enemies/OrcBoss"])


func test_finds_nodes_by_a_name_pattern() -> void:
	assert_eq(_paths(await _find({"name": "*o*s*"})), ["Enemies/OrcBoss"])
	assert_eq(_paths(await _find({"name": "g*"})), ["Enemies/Goblin"])


func test_finds_nodes_of_a_class_and_its_subclasses() -> void:
	assert_eq(_paths(await _find({"type": "Light3D"})), ["Lamp", "Sun"])


func test_finds_nodes_of_a_class_name_from_the_project() -> void:
	assert_eq(_paths(await _find({"type": "PatrolPoint"})), ["Waypoint"])
	assert_eq(_paths(await _find({"type": "Marker3D"})), ["Waypoint"])


func test_finds_nodes_by_group_and_name_together() -> void:
	assert_eq(_paths(await _find({"group": "enemies"})), ["Enemies/Goblin", "Enemies/OrcBoss"])
	assert_eq(_paths(await _find({"group": "enemies", "name": "gob"})), ["Enemies/Goblin"])


func test_finds_nodes_by_their_script() -> void:
	assert_eq(_paths(await _find({"script": "patrol_point.gd"})), ["Waypoint"])
	assert_eq(_paths(await _find({"script": "res://tests/fixtures/patrol_point.gd"})), ["Waypoint"])


func test_describes_each_match() -> void:
	var result: Dictionary = await _find({"name": "goblin"})
	assert_eq(result["matches"], [{"path": "Enemies/Goblin", "type": "CharacterBody3D", "groups": ["enemies"]}])


func test_finds_instances_but_not_the_nodes_inside_them() -> void:
	assert_eq(_paths(await _find({"name": "Mesh"})), [])
	var crate: Dictionary = (await _find({"name": "Crate"}))["matches"][0]
	assert_eq(crate["instance"], "res://tests/fixtures/crate.tscn")


func test_includes_the_scene_root() -> void:
	assert_eq(_paths(await _find({"name": "arena"})), ["."])


func test_limits_the_matches_and_counts_them_all() -> void:
	var result: Dictionary = await _find({"type": "Node3D", "max_results": 2})
	assert_eq((result["matches"] as Array).size(), 2)
	assert_eq(result["total"], 9)
	assert_true(result["truncated"])


func test_suggests_a_known_type_for_a_misspelled_one() -> void:
	var error: Variant = await _find({"type": "MeshInstance"})
	assert_true(error is CommandError)
	assert_eq((error as CommandError).code, JsonRpc.INVALID_PARAMS)
	assert_string_contains((error as CommandError).hint, "MeshInstance3D")


func test_needs_something_to_search_for() -> void:
	var error: Variant = await _find({})
	assert_eq((error as CommandError).code, JsonRpc.INVALID_PARAMS)
