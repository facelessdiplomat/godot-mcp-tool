extends "../command.gd"

const AnimationReference := preload("../../animation/animation_reference.gd")
const ChangeSet := preload("../../scene/change_set.gd")
const EditingContext := preload("../../scene/editing_context.gd")
const IndefiniteArticle := preload("../../util/indefinite_article.gd")
const NodeFactory := preload("../../scene/node_factory.gd")
const NodeLocator := preload("../../scene/node_locator.gd")
const Params := preload("../params.gd")
const StateMachinePlan := preload("../../animation/state_machine_plan.gd")

const STATES_EXAMPLE := "Example: {\"tree\": \"AnimationTree\", \"player\": \"AnimationPlayer\", \"states\": [{\"name\": \"idle\", \"animation\": \"idle\"}, {\"name\": \"walk\", \"animation\": \"walk\"}], \"transitions\": [{\"from\": \"Start\", \"to\": \"idle\"}, {\"from\": \"idle\", \"to\": \"walk\", \"condition\": \"moving\"}]}"

var _context: EditingContext


func _init(context: EditingContext) -> void:
	_context = context


func execute(params: Dictionary) -> Variant:
	var scene_path: Variant = Params.text(params, "scene")
	var tree_path: Variant = Params.required_text(params, "tree", "\"AnimationTree\"")
	var player_path: Variant = Params.text(params, "player")
	for value in [scene_path, tree_path, player_path]:
		if value is CommandError:
			return value
	var state_descriptions: Variant = params.get("states", [])
	var transition_descriptions: Variant = params.get("transitions", [])
	if not state_descriptions is Array or (state_descriptions as Array).is_empty():
		return CommandError.new(JsonRpc.INVALID_PARAMS, "\"states\" needs at least one state", STATES_EXAMPLE)
	if not transition_descriptions is Array:
		return CommandError.new(JsonRpc.INVALID_PARAMS, "\"transitions\" is a list of transitions", STATES_EXAMPLE)
	var resolved: Variant = _context.scenes.resolve_for_editing(scene_path)
	if resolved is CommandError:
		return resolved
	var scene_root := resolved as Node
	var tree: Variant = _find_tree(scene_root, tree_path)
	if tree is CommandError:
		return tree
	var player: Variant = _player_for(scene_root, tree, player_path)
	if player is CommandError:
		return player
	var plan := StateMachinePlan.new(player)
	plan.plan(state_descriptions, transition_descriptions)
	var result := {
		"scene": scene_root.scene_file_path,
		"tree": NodeLocator.path_of(scene_root, tree),
		"player": NodeLocator.path_of(scene_root, player),
		"states": plan.states,
		"transitions": plan.transitions,
		"rejected": plan.rejected,
		"warnings": plan.warnings,
	}
	if plan.states.is_empty():
		return result
	var animation_tree := tree as AnimationTree
	var changes := ChangeSet.new()
	changes.add_do_property(animation_tree, &"tree_root", plan.build())
	changes.add_undo_property(animation_tree, &"tree_root", animation_tree.tree_root)
	var player_reference := animation_tree.get_path_to(player)
	if player_reference != animation_tree.anim_player:
		changes.add_do_property(animation_tree, &"anim_player", player_reference)
		changes.add_undo_property(animation_tree, &"anim_player", animation_tree.anim_player)
	_context.history.record("MCP: Set up the state machine of %s" % animation_tree.name, scene_root, [changes])
	return result


static func _find_tree(scene_root: Node, tree_path: String) -> Variant:
	var node := NodeLocator.find(scene_root, tree_path)
	if node == null:
		return CommandError.new(JsonRpc.NOT_FOUND, "Node \"%s\" not found" % tree_path, NodeLocator.not_found_hint(scene_root, tree_path))
	if not node is AnimationTree:
		return CommandError.new(
			JsonRpc.INVALID_PARAMS,
			"%s is %s, not an AnimationTree" % [tree_path, IndefiniteArticle.before(NodeFactory.display_class(node))],
			"Add an AnimationTree with node_add next to the AnimationPlayer whose animations it blends.",
		)
	return node


static func _player_for(scene_root: Node, tree: AnimationTree, player_path: String) -> Variant:
	if not player_path.is_empty():
		return AnimationReference.find_player(scene_root, player_path)
	var current := tree.get_node_or_null(tree.anim_player) if not tree.anim_player.is_empty() else null
	if current is AnimationPlayer:
		return current
	return CommandError.new(
		JsonRpc.INVALID_PARAMS,
		"%s has no AnimationPlayer to take its animations from" % tree.name,
		"Pass player, the path of the AnimationPlayer, such as \"AnimationPlayer\".",
	)
