extends "../command.gd"

const InputActions := preload("../../input/input_actions.gd")
const Params := preload("../params.gd")
const SimilarNames := preload("../../util/similar_names.gd")


func execute(params: Dictionary) -> Variant:
	var requested_names: Variant = Params.text_list(params, "actions")
	var include_built_in: Variant = Params.flag(params, "include_builtin", false)
	for value in [requested_names, include_built_in]:
		if value is CommandError:
			return value
	var all_names := InputActions.names()
	var selected: Array = []
	var unknown: Array = []
	if (requested_names as Array).is_empty():
		selected = all_names.filter(func(action_name: String) -> bool: return include_built_in or not InputActions.is_built_in_action(action_name))
	for requested_name in requested_names:
		if requested_name in all_names:
			selected.append(requested_name)
		else:
			var similar := SimilarNames.hint(requested_name, all_names)
			unknown.append({"name": requested_name, "reason": "There is no input action \"%s\". %s" % [requested_name, similar if not similar.is_empty() else "Create it with input_map_set."]})
	return {"actions": selected.map(InputActions.describe), "unknown": unknown}
