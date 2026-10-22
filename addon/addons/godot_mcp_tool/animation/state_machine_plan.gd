extends RefCounted

const SimilarNames := preload("../util/similar_names.gd")

const START := "Start"
const END := "End"
const SWITCH_MODES := {
	"immediate": AnimationNodeStateMachineTransition.SWITCH_MODE_IMMEDIATE,
	"sync": AnimationNodeStateMachineTransition.SWITCH_MODE_SYNC,
	"at_end": AnimationNodeStateMachineTransition.SWITCH_MODE_AT_END,
}
const ADVANCE_MODES := {
	"disabled": AnimationNodeStateMachineTransition.ADVANCE_MODE_DISABLED,
	"enabled": AnimationNodeStateMachineTransition.ADVANCE_MODE_ENABLED,
	"auto": AnimationNodeStateMachineTransition.ADVANCE_MODE_AUTO,
}
const MAXIMUM_PRIORITY := 32
const STATES_PER_ROW := 4
const FIRST_STATE_POSITION := Vector2(200, 250)
const STATE_SPACING := Vector2(200, 150)

var states: Array = []
var transitions: Array = []
var rejected: Array = []
var warnings: Array = []
var _player: AnimationPlayer
var _condition_pattern := RegEx.create_from_string("^[A-Za-z_][A-Za-z0-9_]*$")


func _init(player: AnimationPlayer) -> void:
	_player = player


func plan(state_descriptions: Array, transition_descriptions: Array) -> void:
	for description in state_descriptions:
		_plan_state(description)
	for description in transition_descriptions:
		_plan_transition(description)
	if not states.is_empty() and not transitions.any(func(transition: Dictionary) -> bool: return transition["from"] == START):
		warnings.append("no transition leaves Start, so the tree plays nothing until a script calls travel() or start() on parameters/playback; add one such as {\"from\": \"Start\", \"to\": \"%s\"}" % states[0]["name"])


func build() -> AnimationNodeStateMachine:
	var machine := AnimationNodeStateMachine.new()
	for index in states.size():
		var node := AnimationNodeAnimation.new()
		node.animation = states[index]["animation"]
		var grid_cell := Vector2(index % STATES_PER_ROW, index / STATES_PER_ROW)
		machine.add_node(states[index]["name"], node, FIRST_STATE_POSITION + grid_cell * STATE_SPACING)
	for planned in transitions:
		var transition := AnimationNodeStateMachineTransition.new()
		transition.advance_mode = ADVANCE_MODES[planned["advance"]]
		transition.switch_mode = SWITCH_MODES[planned["switch"]]
		transition.xfade_time = planned["xfade"]
		transition.advance_condition = planned.get("condition", "")
		transition.advance_expression = planned.get("expression", "")
		transition.priority = planned.get("priority", 1)
		machine.add_transition(planned["from"], planned["to"], transition)
	return machine


func _plan_state(description: Variant) -> void:
	if not description is Dictionary or not description.get("name") is String or not description.get("animation") is String:
		rejected.append({"item": str(description), "reason": "a state is {\"name\": \"walk\", \"animation\": \"walk\"}"})
		return
	var name: String = description["name"]
	var animation: String = description["animation"]
	var reason := ""
	if name.is_empty() or name.contains("/"):
		reason = "state names cannot be empty or contain /"
	elif name == START or name == END:
		reason = "%s and %s are the built-in entry and exit of every state machine; give the state another name" % [START, END]
	elif states.any(func(state: Dictionary) -> bool: return state["name"] == name):
		reason = "this state is given twice"
	elif not _player.has_animation(animation):
		var known := Array(_player.get_animation_list()).map(func(animation_name: StringName) -> String: return str(animation_name))
		var similar := SimilarNames.hint(animation, known)
		reason = "%s has no animation \"%s\"%s" % [_player.name, animation, "" if similar.is_empty() else ". " + similar]
	if not reason.is_empty():
		rejected.append({"item": name, "reason": reason})
		return
	states.append({"name": name, "animation": animation})


func _plan_transition(description: Variant) -> void:
	if not description is Dictionary or not description.get("from") is String or not description.get("to") is String:
		rejected.append({"item": str(description), "reason": "a transition is {\"from\": \"idle\", \"to\": \"walk\"}"})
		return
	var from: String = description["from"]
	var to: String = description["to"]
	var label := "%s -> %s" % [from, to]
	var planned: Variant = _transition(description, from, to)
	if planned is String:
		rejected.append({"item": label, "reason": planned})
		return
	transitions.append(planned)


func _transition(description: Dictionary, from: String, to: String) -> Variant:
	if from == END:
		return "no transition can leave %s" % END
	if to == START:
		return "no transition can enter %s" % START
	if from == to:
		return "a state cannot have a transition to itself"
	for state_name in [from, to]:
		if not _is_known_state(state_name):
			return "there is no state %s. %s" % [state_name, SimilarNames.hint(state_name, _state_names())]
	if transitions.any(func(transition: Dictionary) -> bool: return transition["from"] == from and transition["to"] == to):
		return "this transition is given twice"
	var planned := {"from": from, "to": to}
	var condition: Variant = description.get("condition")
	if condition != null:
		if not condition is String or not _condition_pattern.search(condition):
			return "the condition \"%s\" is not a valid name; use letters, digits and _, such as moving" % condition
		planned["condition"] = condition
	var expression: Variant = description.get("expression")
	if expression != null:
		var parsed := Expression.new()
		if not expression is String or parsed.parse(expression) != OK:
			return "the expression \"%s\" does not parse: %s" % [expression, parsed.get_error_text()]
		planned["expression"] = expression
	var default_advance := "auto" if from == START or planned.has("condition") or planned.has("expression") else "enabled"
	var advance: Variant = description.get("advance", default_advance)
	if not advance in ADVANCE_MODES:
		return "unknown advance \"%s\"; use one of: %s" % [advance, ", ".join(PackedStringArray(ADVANCE_MODES.keys()))]
	var switch: Variant = description.get("switch", "immediate")
	if not switch in SWITCH_MODES:
		return "unknown switch \"%s\"; use one of: %s" % [switch, ", ".join(PackedStringArray(SWITCH_MODES.keys()))]
	var xfade: Variant = description.get("xfade", 0.0)
	if not (xfade is int or xfade is float) or float(xfade) < 0.0:
		return "xfade is the cross-fade time in seconds, 0 or more"
	planned["advance"] = advance
	planned["switch"] = switch
	planned["xfade"] = float(xfade)
	var priority: Variant = description.get("priority")
	if priority != null:
		if not (priority is int or priority is float) or int(priority) < 0 or int(priority) > MAXIMUM_PRIORITY:
			return "priority is a whole number from 0 to %d; lower numbers win" % MAXIMUM_PRIORITY
		planned["priority"] = int(priority)
	return _ordered(planned)


func _is_known_state(state_name: String) -> bool:
	return state_name == START or state_name == END or states.any(func(state: Dictionary) -> bool: return state["name"] == state_name)


func _state_names() -> Array:
	return [START, END] + states.map(func(state: Dictionary) -> String: return state["name"])


static func _ordered(planned: Dictionary) -> Dictionary:
	var ordered := {"from": planned["from"], "to": planned["to"], "advance": planned["advance"], "switch": planned["switch"], "xfade": planned["xfade"]}
	for optional in ["condition", "expression", "priority"]:
		if planned.has(optional):
			ordered[optional] = planned[optional]
	return ordered
