extends RefCounted


static func until(condition: Callable, timeout_msec: int) -> bool:
	var deadline := Time.get_ticks_msec() + timeout_msec
	while not condition.call():
		if Time.get_ticks_msec() >= deadline:
			return false
		await (Engine.get_main_loop() as SceneTree).process_frame
	return true
