extends RefCounted

const APPROXIMATE_TYPES := [
	TYPE_VECTOR2,
	TYPE_VECTOR3,
	TYPE_VECTOR4,
	TYPE_COLOR,
	TYPE_QUATERNION,
	TYPE_PLANE,
	TYPE_RECT2,
	TYPE_AABB,
	TYPE_BASIS,
	TYPE_TRANSFORM2D,
	TYPE_TRANSFORM3D,
]


static func matches(expected: Variant, actual: Variant) -> bool:
	var expected_type := typeof(expected)
	var actual_type := typeof(actual)
	if _is_number_type(expected_type) and _is_number_type(actual_type):
		return is_equal_approx(float(expected), float(actual))
	if expected_type != actual_type:
		return false
	if expected_type in APPROXIMATE_TYPES:
		return expected.is_equal_approx(actual)
	if expected_type == TYPE_OBJECT:
		return _objects_match(expected, actual)
	if expected_type == TYPE_ARRAY:
		return _arrays_match(expected, actual)
	if expected_type == TYPE_DICTIONARY:
		return _dictionaries_match(expected, actual)
	if expected_type >= TYPE_PACKED_BYTE_ARRAY:
		return _arrays_match(Array(expected), Array(actual))
	return expected == actual


static func _is_number_type(type: int) -> bool:
	return type == TYPE_INT or type == TYPE_FLOAT


static func _objects_match(expected: Object, actual: Object) -> bool:
	if is_same(expected, actual):
		return true
	if expected is Resource and actual is Resource:
		var expected_path := (expected as Resource).resource_path
		return not expected_path.is_empty() and expected_path == (actual as Resource).resource_path
	return false


static func _arrays_match(expected: Array, actual: Array) -> bool:
	if expected.size() != actual.size():
		return false
	for index in expected.size():
		if not matches(expected[index], actual[index]):
			return false
	return true


static func _dictionaries_match(expected: Dictionary, actual: Dictionary) -> bool:
	if expected.size() != actual.size():
		return false
	for key in expected:
		if not actual.has(key) or not matches(expected[key], actual[key]):
			return false
	return true
