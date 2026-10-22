extends GutTest

const GlobalClassSummary := preload("res://addons/godot_mcp_tool/project/global_class_summary.gd")


func test_lists_the_project_classes_and_counts_the_classes_of_each_addon() -> void:
	var global_classes: Array[Dictionary] = [
		_global_class("CmdOption", "RefCounted", "res://addons/gdUnit4/src/cmd/CmdOption.gd"),
		_global_class("GdUnitTestSuite", "Node", "res://addons/gdUnit4/src/GdUnitTestSuite.gd"),
		_global_class("GutTest", "Node", "res://addons/gut/test.gd"),
		_global_class("PatrolPoint", "Marker3D", "res://ai/patrol_point.gd"),
	]
	var summary := GlobalClassSummary.summarize(global_classes, 10)
	assert_eq(summary["project"], [{"name": "PatrolPoint", "base": "Marker3D", "path": "res://ai/patrol_point.gd"}])
	assert_eq(summary["project_count"], 1)
	assert_eq(summary["addons"], [{"folder": "gdUnit4", "count": 2}, {"folder": "gut", "count": 1}])


func test_lists_at_most_the_given_number_of_project_classes() -> void:
	var global_classes: Array[Dictionary] = [
		_global_class("EnemyStats", "Resource", "res://ai/enemy_stats.gd"),
		_global_class("PatrolPoint", "Marker3D", "res://ai/patrol_point.gd"),
		_global_class("Player", "CharacterBody3D", "res://player/player.gd"),
	]
	var summary := GlobalClassSummary.summarize(global_classes, 2)
	var shown_names: Array = (summary["project"] as Array).map(func(entry: Dictionary) -> String: return entry["name"])
	assert_eq(shown_names, ["EnemyStats", "PatrolPoint"])
	assert_eq(summary["project_count"], 3)


func test_orders_the_addons_by_folder_name_ignoring_case() -> void:
	var global_classes: Array[Dictionary] = [
		_global_class("PhantomCamera3D", "Node3D", "res://addons/phantom_camera/scripts/phantom_camera/phantom_camera_3d.gd"),
		_global_class("TodoItem", "RefCounted", "res://addons/Todo_Manager/todo_item_class.gd"),
		_global_class("DialogicTimeline", "Resource", "res://addons/dialogic/Resources/timeline.gd"),
	]
	var summary := GlobalClassSummary.summarize(global_classes, 10)
	var folders: Array = (summary["addons"] as Array).map(func(entry: Dictionary) -> String: return entry["folder"])
	assert_eq(folders, ["dialogic", "phantom_camera", "Todo_Manager"])
	assert_eq(summary["project"], [])
	assert_eq(summary["project_count"], 0)


func _global_class(class_text: String, base: String, path: String) -> Dictionary:
	return {"class": StringName(class_text), "base": StringName(base), "path": path, "icon": "", "language": &"GDScript", "is_abstract": false, "is_tool": false}
