extends RefCounted

const MINIMUM_SIMILARITY := 0.5
const DEFAULT_LIMIT := 3
const CLOSE_EDIT_BONUS := 0.5
const NAME_LENGTH_PER_ALLOWED_EDIT := 4.0


static func find(name: String, candidates: Array, limit: int = DEFAULT_LIMIT) -> PackedStringArray:
	var scored: Array = []
	var lowercase_name := name.to_lower()
	var allowed_edits := maxi(1, floori(lowercase_name.length() / NAME_LENGTH_PER_ALLOWED_EDIT))
	for candidate in candidates:
		var candidate_text := str(candidate)
		var lowercase_candidate := candidate_text.to_lower()
		var similarity := lowercase_name.similarity(lowercase_candidate)
		var is_close := _is_within_edits(lowercase_name, lowercase_candidate, allowed_edits)
		if similarity >= MINIMUM_SIMILARITY or is_close:
			scored.append([similarity + (CLOSE_EDIT_BONUS if is_close else 0.0), candidate_text])
	scored.sort_custom(func(left: Array, right: Array) -> bool: return left[0] > right[0])
	var names := PackedStringArray()
	for entry in scored.slice(0, limit):
		names.append(entry[1])
	return names


static func hint(name: String, candidates: Array) -> String:
	var similar := find(name, candidates)
	return "" if similar.is_empty() else "Similar: %s." % ", ".join(similar)


static func _is_within_edits(left: String, right: String, allowed_edits: int) -> bool:
	if absi(left.length() - right.length()) > allowed_edits:
		return false
	return _edit_distance(left, right) <= allowed_edits


static func _edit_distance(left: String, right: String) -> int:
	var previous_row := PackedInt32Array()
	for column in right.length() + 1:
		previous_row.append(column)
	for row in range(1, left.length() + 1):
		var current_row := PackedInt32Array([row])
		for column in range(1, right.length() + 1):
			var substitution_cost := 0 if left[row - 1] == right[column - 1] else 1
			current_row.append(mini(mini(previous_row[column] + 1, current_row[column - 1] + 1), previous_row[column - 1] + substitution_cost))
		previous_row = current_row
	return previous_row[right.length()]
