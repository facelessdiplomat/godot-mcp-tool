extends RefCounted


static func of(value: float, decimals: int) -> String:
	return str(roundi(value)) if is_equal_approx(value, roundf(value)) else String.num(value, decimals)
