extends RefCounted


static func parse(hint_string: String) -> Array:
	var options: Array = []
	var next_value := 0
	for entry in hint_string.split(",", false):
		var parts := entry.split(":")
		var option_name := parts[0].strip_edges()
		if option_name.is_empty():
			continue
		var option_value := next_value
		if parts.size() > 1 and parts[1].strip_edges().is_valid_int():
			option_value = parts[1].strip_edges().to_int()
		options.append({"name": option_name, "value": option_value})
		next_value = option_value + 1
	return options


static func name_of(options: Array, value: int) -> String:
	for option in options:
		if option["value"] == value:
			return option["name"]
	return ""
