extends GutTest

const ResponsivenessPolicy := preload("res://addons/godot_mcp_tool/editor/responsiveness_policy.gd")

const FOCUSED_SLEEP_USEC := 6900
const UNFOCUSED_SLEEP_USEC := 100000


func _desired(now_msec: int, last_activity_msec: int) -> int:
	return ResponsivenessPolicy.desired_unfocused_sleep_usec(now_msec, last_activity_msec, FOCUSED_SLEEP_USEC, UNFOCUSED_SLEEP_USEC)


func test_keeps_the_editor_responsive_right_after_a_request() -> void:
	assert_eq(_desired(10_000, 9_000), FOCUSED_SLEEP_USEC)


func test_restores_the_editor_setting_after_a_quiet_period() -> void:
	assert_eq(_desired(100_000, 100_000 - ResponsivenessPolicy.ACTIVE_PERIOD_MSEC - 1), UNFOCUSED_SLEEP_USEC)


func test_uses_the_editor_setting_before_any_request() -> void:
	assert_eq(_desired(10_000, -1), UNFOCUSED_SLEEP_USEC)


func test_never_slows_the_editor_down() -> void:
	assert_eq(ResponsivenessPolicy.desired_unfocused_sleep_usec(10_000, 9_000, 50_000, 20_000), 20_000)
