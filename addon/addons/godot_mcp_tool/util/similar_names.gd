extends RefCounted

const MINIMUM_SIMILARITY := 0.5
const DEFAULT_LIMIT := 3


static func find(name: String, candidates: Array, limit: int = DEFAULT_LIMIT) -> PackedStringArray:
	var scored: Array = []
	var lowercase_name := name.to_lower()
	for candidate in candidates:
		var candidate_text := str(candidate)
		var similarity := lowercase_name.similarity(candidate_text.to_lower())
		if similarity >= MINIMUM_SIMILARITY:
			scored.append([similarity, candidate_text])
	scored.sort_custom(func(left: Array, right: Array) -> bool: return left[0] > right[0])
	var names := PackedStringArray()
	for entry in scored.slice(0, limit):
		names.append(entry[1])
	return names


static func hint(name: String, candidates: Array) -> String:
	var similar := find(name, candidates)
	return "" if similar.is_empty() else "Similar: %s." % ", ".join(similar)
