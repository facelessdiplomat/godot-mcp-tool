extends GutTest

const GodotMcpSymbolUsesInText := preload("res://addons/godot_mcp_tool/scene/symbol_uses_in_text.gd")

const ARENA := """[gd_scene load_steps=5 format=3 uid="uid://arena"]

[ext_resource type="Script" path="res://enemy.gd" id="1_enemy"]
[ext_resource type="Script" path="res://door.gd" id="2_door"]
[ext_resource type="PackedScene" path="res://enemy.tscn" id="3_scene"]

[sub_resource type="Animation" id="Animation_hit"]
tracks/0/type = "method"
tracks/0/path = NodePath("Goblin")
tracks/0/keys = {"times": PackedFloat32Array(0.5, 0.8), "values": [{"args": [1], "method": &"take_damage"}, {"args": [2], "method": &"take_damage"}]}
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


func _uses(symbol: String, kind: String, text := ARENA) -> Array:
	return GodotMcpSymbolUsesInText.uses_of(text, {"script": "res://enemy.gd", "symbol": symbol, "kind": kind}, _scene_roots)


func test_finds_the_connections_to_nodes_with_the_script_and_the_method_track_keys_of_a_function() -> void:
	assert_eq(_uses("take_damage", "function"), [
		{"line": 10, "kind": "method_keys", "count": 2, "node": ""},
		{"line": 29, "kind": "connections", "count": 1, "node": "Goblin"},
		{"line": 31, "kind": "connections", "count": 1, "node": "Orc"},
	])


func test_finds_the_connections_from_nodes_with_the_script_of_a_signal() -> void:
	assert_eq(_uses("died", "signal"), [{"line": 32, "kind": "connections", "count": 1, "node": "Goblin"}])


func test_finds_the_saved_values_and_animated_paths_of_a_variable() -> void:
	assert_eq(_uses("health", "variable"), [
		{"line": 12, "kind": "animated_paths", "count": 1, "node": "Goblin"},
		{"line": 18, "kind": "properties", "count": 1, "node": "Goblin"},
		{"line": 25, "kind": "properties", "count": 1, "node": "Orc"},
	])


func test_finds_nothing_for_other_kinds_of_symbols() -> void:
	assert_eq(_uses("MAX_HEALTH", "other"), [])


func test_finds_nothing_in_a_file_without_the_script() -> void:
	var other := ARENA.replace("res://enemy.gd", "res://other.gd").replace("res://enemy.tscn", "res://other.tscn")
	assert_eq(_uses("take_damage", "function", other), [])
