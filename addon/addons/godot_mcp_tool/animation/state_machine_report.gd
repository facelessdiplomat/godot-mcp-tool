extends RefCounted

const NodeLocator := preload("../scene/node_locator.gd")
const StateMachinePlan := preload("state_machine_plan.gd")

const DECIMAL_SCALE := 1000.0
const DEFAULT_PRIORITY := 1


static func describe(tree: AnimationTree, scene_root: Node, scene_path: String) -> Dictionary:
	var player := tree.get_node_or_null(tree.anim_player) if not tree.anim_player.is_empty() else null
	var report := {
		"scene": scene_path,
		"tree": NodeLocator.path_of(scene_root, tree),
		"player": NodeLocator.path_of(scene_root, player) if player != null else "",
		"active": tree.active,
		"expression_base": str(tree.advance_expression_base_node),
		"root": tree.tree_root.get_class() if tree.tree_root != null else "",
	}
	if tree.tree_root is AnimationNodeStateMachine:
		var machine := tree.tree_root as AnimationNodeStateMachine
		report["states"] = _states(machine)
		report["transitions"] = _transitions(machine)
		report["conditions"] = _conditions(machine)
	return report


static func _states(machine: AnimationNodeStateMachine) -> Array:
	var names: Array = Array(machine.get_node_list()).map(func(name: StringName) -> String: return str(name)).filter(func(name: String) -> bool: return name != StateMachinePlan.START and name != StateMachinePlan.END)
	names.sort()
	return names.map(func(name: String) -> Dictionary: return _state(name, machine.get_node(name)))


static func _state(name: String, node: AnimationNode) -> Dictionary:
	if node is AnimationNodeAnimation:
		return {"name": name, "animation": str((node as AnimationNodeAnimation).animation)}
	return {"name": name, "type": node.get_class()}


static func _transitions(machine: AnimationNodeStateMachine) -> Array:
	var described: Array = []
	for index in machine.get_transition_count():
		var transition := machine.get_transition(index)
		var entry := {
			"from": str(machine.get_transition_from(index)),
			"to": str(machine.get_transition_to(index)),
			"advance": _name_of(StateMachinePlan.ADVANCE_MODES, transition.advance_mode),
			"switch": _name_of(StateMachinePlan.SWITCH_MODES, transition.switch_mode),
			"xfade": roundf(transition.xfade_time * DECIMAL_SCALE) / DECIMAL_SCALE,
		}
		if not str(transition.advance_condition).is_empty():
			entry["condition"] = str(transition.advance_condition)
		if not transition.advance_expression.is_empty():
			entry["expression"] = transition.advance_expression
		if transition.priority != DEFAULT_PRIORITY:
			entry["priority"] = transition.priority
		described.append(entry)
	return described


static func _conditions(machine: AnimationNodeStateMachine) -> Array:
	var conditions: Array = []
	for index in machine.get_transition_count():
		var condition := str(machine.get_transition(index).advance_condition)
		if not condition.is_empty() and not condition in conditions:
			conditions.append(condition)
	return conditions


static func _name_of(names: Dictionary, value: int) -> String:
	for name in names:
		if names[name] == value:
			return name
	return str(value)
