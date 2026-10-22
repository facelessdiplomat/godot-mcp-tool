extends RefCounted

const ACTIVE_PERIOD_MSEC := 30_000


static func desired_unfocused_sleep_usec(now_msec: int, last_activity_msec: int, focused_sleep_usec: int, unfocused_sleep_usec: int) -> int:
	var recently_active := last_activity_msec >= 0 and now_msec - last_activity_msec <= ACTIVE_PERIOD_MSEC
	if recently_active:
		return mini(focused_sleep_usec, unfocused_sleep_usec)
	return unfocused_sleep_usec
