extends GutTest

const GodotMcpSymbolRenameInText := preload("res://addons/godot_mcp_tool/scene/symbol_rename_in_text.gd")

const ARENA := """[gd_scene load_steps=5 format=3 uid="uid://arena"]

[ext_resource type="Script" path="res://enemy.gd" id="1_enemy"]
[ext_resource type="Script" path="res://door.gd" id="2_door"]
[ext_resource type="PackedScene" path="res://enemy.tscn" id="3_scene"]

[sub_resource type="Animation" id="Animation_hit"]
tracks/0/type = "method"
tracks/0/path = NodePath("Goblin")
tracks/0/keys = {
"times": PackedFloat32Array(0.5),
"values": [{
"args": [1],
"method": &"take_damage"
}]
}
tracks/1/type = "value"
tracks/1/path = NodePath("Goblin:health")

[node name="Arena" type="Node3D"]

[node name="Goblin" type="CharacterBody3D" parent="." unique_id=11]
script = ExtResource("1_enemy")
health = 5

[node name="Door" type="Node3D" parent="." unique_id=12]
script = ExtResource("2_door")
health = 9

[node name="Orc" parent="." instance=ExtResource("3_scene")]
health = 7

[node name="Spikes" type="Area3D" parent="."]

[connection signal="body_entered" from="Spikes" to="Goblin" method="take_damage"]
[connection signal="body_entered" from="Spikes" to="Door" method="take_damage"]
[connection signal="body_entered" from="Spikes" to="Orc" method="take_damage"]
[connection signal="died" from="Goblin" to="." method="_on_died"]
[connection signal="died" from="Door" to="." method="_on_died"]
"""


func _scene_roots(scene_path: String) -> String:
	return "res://enemy.gd" if scene_path == "res://enemy.tscn" else ""


func _renamed(symbol: String, new_name: String, kind: String) -> Dictionary:
	return GodotMcpSymbolRenameInText.renamed(ARENA, {"script": "res://enemy.gd", "symbol": symbol, "new_name": new_name, "kind": kind}, _scene_roots)


func test_renames_the_method_of_connections_to_nodes_with_the_script_and_of_method_tracks() -> void:
	var result := _renamed("take_damage", "apply_damage", "function")
	var text: String = result["text"]
	assert_string_contains(text, '[connection signal="body_entered" from="Spikes" to="Goblin" method="apply_damage"]')
	assert_string_contains(text, '[connection signal="body_entered" from="Spikes" to="Door" method="take_damage"]')
	assert_string_contains(text, '[connection signal="body_entered" from="Spikes" to="Orc" method="apply_damage"]')
	assert_string_contains(text, '"method": &"apply_damage"')
	assert_eq(result["changes"], {"connections": 2, "method_keys": 1})


func test_renames_a_signal_where_a_node_with_the_script_emits_it() -> void:
	var result := _renamed("died", "fell", "signal")
	var text: String = result["text"]
	assert_string_contains(text, '[connection signal="fell" from="Goblin" to="." method="_on_died"]')
	assert_string_contains(text, '[connection signal="died" from="Door" to="." method="_on_died"]')
	assert_eq(result["changes"], {"connections": 1})


func test_renames_the_saved_values_and_animated_paths_of_a_variable() -> void:
	var result := _renamed("health", "hit_points", "variable")
	var text: String = result["text"]
	assert_string_contains(text, 'script = ExtResource("1_enemy")\nhit_points = 5')
	assert_string_contains(text, 'script = ExtResource("2_door")\nhealth = 9')
	assert_string_contains(text, 'instance=ExtResource("3_scene")]\nhit_points = 7')
	assert_string_contains(text, 'NodePath("Goblin:hit_points")')
	assert_eq(result["changes"], {"properties": 2, "animated_paths": 1})


func test_leaves_a_file_without_the_script_alone() -> void:
	var other := ARENA.replace("res://enemy.gd", "res://other.gd").replace("res://enemy.tscn", "res://other.tscn")
	var result := GodotMcpSymbolRenameInText.renamed(other, {"script": "res://enemy.gd", "symbol": "take_damage", "new_name": "apply_damage", "kind": "function"}, _scene_roots)
	assert_eq(result["text"], other)
	assert_eq(result["changes"], {})
