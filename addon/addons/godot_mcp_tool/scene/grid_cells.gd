extends RefCounted

const GodotMcpCommandError := preload("../commands/command_error.gd")
const GodotMcpJsonRpc := preload("../bridge/json_rpc.gd")

const MAXIMUM_CELLS_AT_ONCE := 100_000


static func whole_number(value: Variant) -> Variant:
	if value is int:
		return value
	if value is float and is_equal_approx(value, roundf(value)):
		return int(value)
	return null


static func cell_3d(value: Variant, label: String) -> Variant:
	var sides: Variant = _whole_numbers(value, 3)
	if sides == null:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "%s must be [x, y, z] in whole cells" % label, "Example: [-4, 0, 3]")
	return Vector3i(sides[0], sides[1], sides[2])


static func cell_2d(value: Variant, label: String) -> Variant:
	var sides: Variant = _whole_numbers(value, 2)
	if sides == null:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "%s must be [x, y] in whole cells" % label, "Example: [12, 3]")
	return Vector2i(sides[0], sides[1])


static func too_many_cells_error() -> GodotMcpCommandError:
	return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "That changes more than %d cells at once" % MAXIMUM_CELLS_AT_ONCE, "Split the work into smaller boxes.")


static func listed(params: Dictionary, key: String) -> Variant:
	var value: Variant = params.get(key, [])
	if not value is Array:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "\"%s\" must be a list" % key)
	return value


static func _whole_numbers(value: Variant, count: int) -> Variant:
	if not value is Array or (value as Array).size() != count:
		return null
	var numbers: Array[int] = []
	for side in value:
		var number: Variant = whole_number(side)
		if number == null:
			return null
		numbers.append(number)
	return numbers
