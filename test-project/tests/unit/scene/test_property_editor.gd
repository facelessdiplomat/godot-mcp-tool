extends GutTest

const PlainUndoHistory := preload("res://addons/godot_mcp_tool/scene/plain_undo_history.gd")
const PropertyEditor := preload("res://addons/godot_mcp_tool/scene/property_editor.gd")
const VariantCodec := preload("res://addons/godot_mcp_tool/codec/variant_codec.gd")

var _history: PlainUndoHistory
var _editor: PropertyEditor


func before_each() -> void:
	_history = PlainUndoHistory.new()
	_editor = PropertyEditor.new(VariantCodec.new())


func after_each() -> void:
	_history.dispose()


func _entry_named(entries: Array, property_name: String) -> Dictionary:
	for entry in entries:
		if entry["name"] == property_name:
			return entry
	return {}


func test_describes_only_properties_that_differ_from_their_defaults() -> void:
	var mesh_instance: MeshInstance3D = autofree(MeshInstance3D.new())
	mesh_instance.mesh = BoxMesh.new()
	mesh_instance.position = Vector3(1, 0, 0)
	var entries := _editor.describe(mesh_instance, PackedStringArray(), false)
	assert_eq(_entry_named(entries, "mesh").get("value"), "<BoxMesh>")
	assert_eq(_entry_named(entries, "position").get("value"), "Vector3(1, 0, 0)")
	assert_true(_entry_named(entries, "visible").is_empty())


func test_describes_requested_properties_even_at_their_defaults() -> void:
	var mesh_instance: MeshInstance3D = autofree(MeshInstance3D.new())
	var entries := _editor.describe(mesh_instance, PackedStringArray(["visible", "cast_shadow"]), false)
	assert_eq(entries.size(), 2)
	assert_eq(_entry_named(entries, "visible").get("value"), true)


func test_lists_the_options_of_enum_properties() -> void:
	var mesh_instance: MeshInstance3D = autofree(MeshInstance3D.new())
	var entry := _entry_named(_editor.describe(mesh_instance, PackedStringArray(["cast_shadow"]), false), "cast_shadow")
	assert_eq(entry.get("value"), 1)
	assert_eq(entry.get("options"), [
		{"name": "Off", "value": 0},
		{"name": "On", "value": 1},
		{"name": "Double-Sided", "value": 2},
		{"name": "Shadows Only", "value": 3},
	])


func test_applies_several_properties_as_one_undoable_action() -> void:
	var mesh_instance: MeshInstance3D = autofree(MeshInstance3D.new())
	var report := _editor.apply(mesh_instance, {"position": [0, 1, 0], "mesh": {"new": "SphereMesh"}}, _history, "MCP: Set properties", mesh_instance)
	assert_eq(report["applied"], ["position", "mesh"])
	assert_true(mesh_instance.mesh is SphereMesh)
	assert_eq(_history.last_action_name(), "MCP: Set properties")
	assert_true(_history.undo())
	assert_eq(mesh_instance.position, Vector3.ZERO)
	assert_null(mesh_instance.mesh)


func test_rejects_unknown_properties_with_suggestions() -> void:
	var mesh_instance: MeshInstance3D = autofree(MeshInstance3D.new())
	var report := _editor.apply(mesh_instance, {"positon": [0, 1, 0]}, _history, "MCP: Set properties", mesh_instance)
	var rejected: Dictionary = report["rejected"][0]
	assert_eq(rejected["name"], "positon")
	assert_string_contains(rejected["reason"], "position")


func test_rejects_values_that_cannot_be_decoded_and_applies_the_rest() -> void:
	var mesh_instance: MeshInstance3D = autofree(MeshInstance3D.new())
	var report := _editor.apply(mesh_instance, {"position": [0, 1], "visible": false}, _history, "MCP: Set properties", mesh_instance)
	assert_eq(report["applied"], ["visible"])
	assert_string_contains((report["rejected"][0] as Dictionary)["reason"], "3 numbers")


func test_reports_values_that_the_engine_changed_on_assignment() -> void:
	var progress_bar: ProgressBar = autofree(ProgressBar.new())
	var report := _editor.apply(progress_bar, {"value": 500}, _history, "MCP: Set properties", progress_bar)
	var not_applied: Dictionary = report["not_applied"][0]
	assert_eq(not_applied["name"], "value")
	assert_eq(not_applied["actual"], 100.0)


func test_sets_the_script_before_script_properties() -> void:
	var marker: Marker3D = autofree(Marker3D.new())
	var report := _editor.apply(marker, {"wait_seconds": 3, "script": "res://tests/fixtures/patrol_point.gd"}, _history, "MCP: Set properties", marker)
	assert_eq(report["applied"], ["script", "wait_seconds"])
	assert_eq(marker.get("wait_seconds"), 3.0)


func test_sets_rotation_in_degrees_through_the_scripting_property() -> void:
	var node: Node3D = autofree(Node3D.new())
	var report := _editor.apply(node, {"rotation_degrees": [0, 90, 0]}, _history, "MCP: Rotate", node)
	assert_eq(report["applied"], ["rotation_degrees"])
	assert_almost_eq(node.rotation.y, PI / 2, 0.0001)
	assert_true(_history.undo())
	assert_eq(node.rotation, Vector3.ZERO)


func test_sets_the_stored_transform() -> void:
	var node: Node3D = autofree(Node3D.new())
	var report := _editor.assign(node, {"transform": "Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, 2, 3, 4)"})
	assert_eq(report["applied"], ["transform"])
	assert_eq(node.position, Vector3(2, 3, 4))


func test_suggests_scripting_properties_for_misspelled_names() -> void:
	var node: Node3D = autofree(Node3D.new())
	var report := _editor.assign(node, {"rotation_degree": [0, 90, 0]})
	assert_string_contains((report["rejected"][0] as Dictionary)["reason"], "rotation_degrees")


func test_refuses_properties_that_tie_the_node_to_its_scene() -> void:
	var node: Node3D = autofree(Node3D.new())
	var report := _editor.assign(node, {"owner": null, "scene_file_path": "res://elsewhere.tscn"})
	assert_eq(report["applied"], [])
	assert_eq((report["rejected"] as Array).map(func(rejection: Dictionary) -> String: return rejection["name"]), ["owner", "scene_file_path"])


func test_neither_lists_nor_sets_the_file_path_of_a_resource() -> void:
	var material := StandardMaterial3D.new()
	material.resource_path = "res://materials/orange.tres"
	material.albedo_color = Color.ORANGE
	var entries := _editor.describe(material, PackedStringArray(), false)
	var report := _editor.assign(material, {"resource_path": "res://elsewhere.tres"})
	assert_true(_entry_named(entries, "resource_path").is_empty())
	assert_false(_entry_named(entries, "albedo_color").is_empty())
	assert_eq(report["applied"], [])
	assert_eq(material.resource_path, "res://materials/orange.tres")
	material.resource_path = ""


func test_reads_a_scripting_property_by_name() -> void:
	var node: Node3D = autofree(Node3D.new())
	var entry := _entry_named(_editor.describe(node, PackedStringArray(["rotation_degrees"]), false), "rotation_degrees")
	assert_eq(entry.get("type"), "Vector3")
	assert_eq(entry.get("value"), "Vector3(0, 0, 0)")


func test_lists_only_inspector_properties_by_default() -> void:
	var node: Node3D = autofree(Node3D.new())
	node.rotation_degrees = Vector3(0, 90, 0)
	var entries := _editor.describe(node, PackedStringArray(), false)
	assert_false(_entry_named(entries, "rotation").is_empty())
	assert_true(_entry_named(entries, "rotation_degrees").is_empty())
