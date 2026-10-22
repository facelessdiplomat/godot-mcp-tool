extends "../command.gd"

const InputActions := preload("../../input/input_actions.gd")
const InputEventCodec := preload("../../input/input_event_codec.gd")
const Params := preload("../params.gd")

const FORBIDDEN_NAME_CHARACTERS := ["/", ":", "\"", "="]

var _save_settings: Callable


func _init(save_settings: Callable) -> void:
	_save_settings = save_settings


func execute(params: Dictionary) -> Variant:
	var actions: Variant = Params.dictionary(params, "actions")
	if actions is CommandError:
		return actions
	if (actions as Dictionary).is_empty():
		return CommandError.new(JsonRpc.INVALID_PARAMS, "\"actions\" needs at least one action", "Example: {\"actions\": {\"move_forward\": [\"W\", \"Up\"], \"jump\": [\"Space\"]}}")
	var applied: Array = []
	var removed: Array = []
	var rejected: Array = []
	var previous := {}
	for action_key in actions:
		var action_name := str(action_key)
		var rejection := _check_name(action_name)
		if rejection.is_empty() and actions[action_key] == null:
			rejection = _check_removal(action_name)
			if rejection.is_empty():
				previous[action_name] = InputActions.described_events(action_name)
				InputActions.remove(action_name)
				removed.append(action_name)
				continue
		if not rejection.is_empty():
			rejected.append({"name": action_name, "reason": rejection})
			continue
		var parsed: Variant = _parse(actions[action_key], InputActions.deadzone_of(action_name))
		if parsed is String:
			rejected.append({"name": action_name, "reason": parsed})
			continue
		previous[action_name] = InputActions.described_events(action_name) if InputActions.exists(action_name) else null
		InputActions.write(action_name, parsed["deadzone"], parsed["events"])
		applied.append(action_name)
	if not applied.is_empty() or not removed.is_empty():
		var save_error: Error = _save_settings.call()
		if save_error != OK:
			return CommandError.new(JsonRpc.OPERATION_FAILED, "The input actions changed but project.godot could not be saved: %s" % error_string(save_error))
	return {"applied": applied, "removed": removed, "rejected": rejected, "previous": previous, "actions": applied.map(InputActions.describe)}


static func _check_name(action_name: String) -> String:
	if action_name.strip_edges().is_empty():
		return "An action needs a name"
	for character in FORBIDDEN_NAME_CHARACTERS:
		if action_name.contains(character):
			return "Action names cannot contain %s" % character
	return ""


static func _check_removal(action_name: String) -> String:
	if InputActions.is_built_in_action(action_name):
		return "Built-in ui_ actions cannot be removed; give them other events instead"
	if not InputActions.exists(action_name):
		return "There is no input action \"%s\" to remove" % action_name
	return ""


static func _parse(description: Variant, current_deadzone: float) -> Variant:
	var event_descriptions: Variant = description
	var deadzone := current_deadzone
	if description is Dictionary:
		event_descriptions = (description as Dictionary).get("events", [])
		var given_deadzone: Variant = (description as Dictionary).get("deadzone", current_deadzone)
		if not (given_deadzone is int or given_deadzone is float) or given_deadzone < 0.0 or given_deadzone > 1.0:
			return "The deadzone is a number from 0 to 1"
		deadzone = float(given_deadzone)
	if not event_descriptions is Array:
		return "Give the events as a list, such as [\"W\", \"Up\"]"
	var events: Array = []
	for event_description in event_descriptions:
		var event: Variant = InputEventCodec.decode(event_description)
		if event is String:
			return event
		events.append(event)
	return {"deadzone": deadzone, "events": events}
