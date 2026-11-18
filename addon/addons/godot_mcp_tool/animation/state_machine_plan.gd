extends RefCounted

const GodotMcpSimilarNames := preload("../util/similar_names.gd")

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
const ANIMATION_STATE_EXAMPLE := "{\"name\": \"walk\", \"animation\": \"walk\"}"
const BLEND_POINTS_EXAMPLE := "[{\"animation\": \"walk\", \"at\": 2}, {\"animation\": \"run\", \"at\": 6}]"
const BLEND_STATE_EXAMPLE := "{\"name\": \"move\", \"blend\": " + BLEND_POINTS_EXAMPLE + "}"

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
		var grid_cell := Vector2(index % STATES_PER_ROW, index / STATES_PER_ROW)
		machine.add_node(states[index]["name"], _state_node(states[index]), FIRST_STATE_POSITION + grid_cell * STATE_SPACING)
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
	if not description is Dictionary or not description.get("name") is String:
		rejected.append({"item": str(description), "reason": "a state is %s, or %s" % [ANIMATION_STATE_EXAMPLE, BLEND_STATE_EXAMPLE]})
		return
	var name: String = description["name"]
	var planned: Variant = _state(description, name)
	if planned is String:
		rejected.append({"item": name, "reason": planned})
		return
	states.append(planned)


static func parameter_of(state_name: String) -> String:
	return "parameters/%s/blend_position" % state_name


func _state(description: Dictionary, name: String) -> Variant:
	if name.is_empty() or name.contains("/"):
		return "state names cannot be empty or contain /"
	if name == START or name == END:
		return "%s and %s are the built-in entry and exit of every state machine; give the state another name" % [START, END]
	if states.any(func(state: Dictionary) -> bool: return state["name"] == name):
		return "this state is given twice"
	if description.has("animation") == description.has("blend"):
		return "a state takes either animation or blend: %s plays one animation, %s blends several by a parameter" % [ANIMATION_STATE_EXAMPLE, BLEND_STATE_EXAMPLE]
	if description.has("blend"):
		return _blend_state(description, name)
	var animation: Variant = description["animation"]
	if not animation is String:
		return "animation names an animation of %s, such as \"walk\"" % _player.name
	var missing := _missing_animation_reason(animation)
	return {"name": name, "animation": animation} if missing.is_empty() else missing


func _blend_state(description: Dictionary, name: String) -> Variant:
	var point_descriptions: Variant = description["blend"]
	if not point_descriptions is Array or (point_descriptions as Array).size() < 2:
		return "a blend needs at least two points, such as %s" % BLEND_POINTS_EXAMPLE
	var points: Array = []
	for point_description in point_descriptions:
		var point: Variant = _blend_point(point_description, points)
		if point is String:
			return point
		points.append(point)
	if not points.front()["at"] is float and Geometry2D.triangulate_delaunay(PackedVector2Array(points.map(func(point: Dictionary) -> Vector2: return _vector_of(point["at"])))).is_empty():
		return "the points of a two-dimensional blend lie on one line, so no triangle can blend them; move one of them off the line"
	var limits: Variant = _blend_limits(description, points)
	if limits is String:
		return limits
	return {"name": name, "blend": points, "min": limits["min"], "max": limits["max"], "parameter": parameter_of(name)}


func _blend_point(point_description: Variant, points: Array) -> Variant:
	if not point_description is Dictionary or not point_description.get("animation") is String:
		return "each point of a blend is {\"animation\": \"walk\", \"at\": 2}, or {\"animation\": \"walk\", \"at\": [0, 1]} in two dimensions"
	var animation: String = point_description["animation"]
	var position: Variant = _blend_position(point_description.get("at"))
	if position == null:
		return "the point of %s has no position; give \"at\" as a number, or as [x, y] in two dimensions" % animation
	if not points.is_empty() and (points.front()["at"] is float) != (position is float):
		return "the blend mixes points of one and of two dimensions; give every \"at\" as a number, or every one as [x, y]"
	var missing := _missing_animation_reason(animation)
	if not missing.is_empty():
		return missing
	if points.any(func(point: Dictionary) -> bool: return point["at"] == position):
		return "two points of the blend are at the same position %s; give each its own" % JSON.stringify(position)
	return {"animation": animation, "at": position}


func _blend_limits(description: Dictionary, points: Array) -> Variant:
	var dimensions := 1 if points.front()["at"] is float else 2
	var lowest: Array = []
	var highest: Array = []
	for axis in dimensions:
		var components := points.map(func(point: Dictionary) -> float: return _component(point["at"], axis))
		lowest.append(components.min())
		highest.append(components.max())
	var minimum: Variant = _blend_position(description["min"]) if description.has("min") else _position_from(lowest)
	var maximum: Variant = _blend_position(description["max"]) if description.has("max") else _position_from(highest)
	for limit in [minimum, maximum]:
		if limit == null or (limit is float) != (dimensions == 1):
			return "min and max are %s, like the points of the blend" % ("numbers" if dimensions == 1 else "[x, y] pairs")
	for axis in dimensions:
		if _component(minimum, axis) >= _component(maximum, axis):
			return "min must be below max on every axis of the blend"
		if lowest[axis] < _component(minimum, axis) or highest[axis] > _component(maximum, axis):
			return "a point of the blend lies outside min %s and max %s; widen them or move the point" % [JSON.stringify(minimum), JSON.stringify(maximum)]
	return {"min": minimum, "max": maximum}


func _missing_animation_reason(animation: String) -> String:
	if _player.has_animation(animation):
		return ""
	var known := Array(_player.get_animation_list()).map(func(animation_name: StringName) -> String: return str(animation_name))
	var similar := GodotMcpSimilarNames.hint(animation, known)
	return "%s has no animation \"%s\"%s" % [_player.name, animation, "" if similar.is_empty() else ". " + similar]


static func _state_node(state: Dictionary) -> AnimationRootNode:
	if state.has("animation"):
		return _animation_node(state["animation"])
	if state["min"] is float:
		return _blend_space_1d(state)
	return _blend_space_2d(state)


static func _animation_node(animation: String) -> AnimationNodeAnimation:
	var node := AnimationNodeAnimation.new()
	node.animation = animation
	return node


static func _blend_space_1d(state: Dictionary) -> AnimationNodeBlendSpace1D:
	var blend_space := AnimationNodeBlendSpace1D.new()
	blend_space.min_space = minf(state["min"], blend_space.max_space - 1.0)
	blend_space.max_space = state["max"]
	blend_space.min_space = state["min"]
	var points: Array = state["blend"]
	var names := _point_names(points)
	for index in points.size():
		blend_space.add_blend_point(_animation_node(points[index]["animation"]), points[index]["at"], -1, names[index])
	return blend_space


static func _blend_space_2d(state: Dictionary) -> AnimationNodeBlendSpace2D:
	var blend_space := AnimationNodeBlendSpace2D.new()
	var minimum := _vector_of(state["min"])
	blend_space.min_space = minimum.min(blend_space.max_space - Vector2.ONE)
	blend_space.max_space = _vector_of(state["max"])
	blend_space.min_space = minimum
	var points: Array = state["blend"]
	var names := _point_names(points)
	for index in points.size():
		blend_space.add_blend_point(_animation_node(points[index]["animation"]), _vector_of(points[index]["at"]), -1, names[index])
	return blend_space


static func _point_names(points: Array) -> Array:
	var names: Array = []
	for point in points:
		var base := str(point["animation"]).replace("/", "_").replace(".", "_")
		var name := base
		var number := 2
		while name in names:
			name = "%s_%d" % [base, number]
			number += 1
		names.append(name)
	return names


static func _blend_position(value: Variant) -> Variant:
	if value is int or value is float:
		return float(value)
	if value is Array and (value as Array).size() == 2 and (value as Array).all(func(component: Variant) -> bool: return component is int or component is float):
		return [float(value[0]), float(value[1])]
	return null


static func _position_from(components: Array) -> Variant:
	return components[0] if components.size() == 1 else components


static func _component(position: Variant, axis: int) -> float:
	return position if position is float else position[axis]


static func _vector_of(position: Array) -> Vector2:
	return Vector2(position[0], position[1])


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
			return "there is no state %s. %s" % [state_name, GodotMcpSimilarNames.hint(state_name, _state_names())]
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
