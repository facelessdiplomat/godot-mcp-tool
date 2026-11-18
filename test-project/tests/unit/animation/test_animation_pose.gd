extends GutTest

const GodotMcpAnimationPose := preload("res://addons/godot_mcp_tool/animation/animation_pose.gd")

const WALKER_SCRIPT := "extends Node3D\n\nvar steps := 0\n\n\nfunc _on_footstep() -> void:\n\tsteps += 1\n"

var _level: Node3D
var _door: Node3D
var _arm: Skeleton3D
var _face: MeshInstance3D
var _walker: Node3D
var _sound: AudioStreamPlayer3D
var _player: AnimationPlayer


func before_each() -> void:
	_level = Node3D.new()
	add_child(_level)
	_door = _add(Node3D.new(), "Door") as Node3D
	_door.position = Vector3(0, 1, 0)
	_door.rotation = Vector3(0, PI / 2, 0)
	_arm = _add(Skeleton3D.new(), "Arm") as Skeleton3D
	_arm.add_bone("Elbow")
	_arm.set_bone_pose_rotation(0, Quaternion(Vector3.UP, 0.25))
	_face = _add(MeshInstance3D.new(), "Face") as MeshInstance3D
	_face.mesh = _mesh_with_blend_shape("smile")
	_face.set_blend_shape_value(0, 0.2)
	var script := GDScript.new()
	script.source_code = WALKER_SCRIPT
	script.reload()
	_walker = _add(Node3D.new(), "Walker") as Node3D
	_walker.set_script(script)
	_sound = _add(AudioStreamPlayer3D.new(), "Sound") as AudioStreamPlayer3D
	_player = _add(AnimationPlayer.new(), "AnimationPlayer") as AnimationPlayer
	var library := AnimationLibrary.new()
	library.add_animation("wave", _wave())
	_player.add_animation_library("", library)


func after_each() -> void:
	_level.free()


func _add(node: Node, name: String) -> Node:
	node.name = name
	_level.add_child(node)
	return node


static func _mesh_with_blend_shape(shape_name: String) -> ArrayMesh:
	var mesh := ArrayMesh.new()
	mesh.add_blend_shape(shape_name)
	var surface := []
	surface.resize(Mesh.ARRAY_MAX)
	surface[Mesh.ARRAY_VERTEX] = PackedVector3Array([Vector3.ZERO, Vector3.RIGHT, Vector3.UP])
	var blend_surface := []
	blend_surface.resize(Mesh.ARRAY_MAX)
	blend_surface[Mesh.ARRAY_VERTEX] = PackedVector3Array([Vector3.ZERO, Vector3.RIGHT, Vector3.UP * 2])
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, surface, [blend_surface])
	return mesh


static func _wave() -> Animation:
	var animation := Animation.new()
	animation.length = 1.0
	var position_track := animation.add_track(Animation.TYPE_VALUE)
	animation.track_set_path(position_track, NodePath("Door:position"))
	animation.track_insert_key(position_track, 0.0, Vector3(0, 1, 0))
	animation.track_insert_key(position_track, 1.0, Vector3(0, 5, 0))
	var rotation_track := animation.add_track(Animation.TYPE_ROTATION_3D)
	animation.track_set_path(rotation_track, NodePath("Door"))
	animation.rotation_track_insert_key(rotation_track, 0.0, Quaternion.IDENTITY)
	animation.rotation_track_insert_key(rotation_track, 1.0, Quaternion(Vector3.UP, PI))
	var bone_track := animation.add_track(Animation.TYPE_ROTATION_3D)
	animation.track_set_path(bone_track, NodePath("Arm:Elbow"))
	animation.rotation_track_insert_key(bone_track, 0.0, Quaternion.IDENTITY)
	animation.rotation_track_insert_key(bone_track, 1.0, Quaternion(Vector3.RIGHT, 1.0))
	var blend_track := animation.add_track(Animation.TYPE_BLEND_SHAPE)
	animation.track_set_path(blend_track, NodePath("Face:smile"))
	animation.blend_shape_track_insert_key(blend_track, 0.0, 0.0)
	animation.blend_shape_track_insert_key(blend_track, 1.0, 1.0)
	var method_track := animation.add_track(Animation.TYPE_METHOD)
	animation.track_set_path(method_track, NodePath("Walker"))
	animation.track_insert_key(method_track, 0.5, {"method": &"_on_footstep", "args": []})
	var audio_track := animation.add_track(Animation.TYPE_AUDIO)
	animation.track_set_path(audio_track, NodePath("Sound"))
	animation.audio_track_insert_key(audio_track, 0.5, AudioStreamWAV.new())
	return animation


func test_poses_the_scene_at_a_time_and_puts_every_animated_value_back() -> void:
	var pose := GodotMcpAnimationPose.new(_player, _player.get_animation("wave"))
	pose.pose_at(0.5)
	assert_almost_eq(_door.position, Vector3(0, 3, 0), Vector3.ONE * 0.001)
	assert_almost_eq(_face.get_blend_shape_value(0), 0.5, 0.001)
	assert_false(_arm.get_bone_pose_rotation(0).is_equal_approx(Quaternion(Vector3.UP, 0.25)))
	pose.pose_at(1.0)
	assert_almost_eq(_door.position, Vector3(0, 5, 0), Vector3.ONE * 0.001)
	pose.restore()
	assert_eq(_door.position, Vector3(0, 1, 0))
	assert_eq(_door.rotation, Vector3(0, PI / 2, 0))
	assert_true(_arm.get_bone_pose_rotation(0).is_equal_approx(Quaternion(Vector3.UP, 0.25)))
	assert_almost_eq(_face.get_blend_shape_value(0), 0.2, 0.0001)


func test_calls_no_method_plays_no_sound_and_leaves_the_player_alone() -> void:
	var pose := GodotMcpAnimationPose.new(_player, _player.get_animation("wave"))
	var children_before := _level.get_child_count(true)
	pose.pose_at(0.5)
	assert_eq(_walker.get("steps"), 0)
	assert_false(_sound.playing)
	assert_eq(_player.assigned_animation, &"")
	assert_false(_player.is_playing())
	pose.restore()
	assert_eq(_level.get_child_count(true), children_before)
	assert_eq(_player.get_animation("wave").get_track_count(), 6)
