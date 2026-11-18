extends RefCounted

const POSE_NAME := &"pose"
const POSED_TRACK_TYPES := [Animation.TYPE_VALUE, Animation.TYPE_POSITION_3D, Animation.TYPE_ROTATION_3D, Animation.TYPE_SCALE_3D, Animation.TYPE_BLEND_SHAPE, Animation.TYPE_BEZIER]
const TRANSFORM_TRACK_TYPES := [Animation.TYPE_POSITION_3D, Animation.TYPE_ROTATION_3D, Animation.TYPE_SCALE_3D]
const NODE_3D_TRANSFORM_PROPERTIES := [&"position", &"rotation", &"scale"]

var _root: Node
var _animation: Animation
var _restorers: Array[Callable] = []
var _poser: AnimationPlayer


func _init(player: AnimationPlayer, animation: Animation) -> void:
	_root = player.get_node(player.root_node)
	_animation = _posed_copy_of(animation)
	for index in _animation.get_track_count():
		_remember_values_of_track(index)


func pose_at(time: float) -> void:
	if _poser == null:
		_poser = _new_poser()
	_poser.seek(time, true)


func restore() -> void:
	if _poser != null:
		_root.remove_child(_poser)
		_poser.free()
		_poser = null
	for restorer in _restorers:
		restorer.call()


func _new_poser() -> AnimationPlayer:
	var poser := AnimationPlayer.new()
	poser.reset_on_save = false
	var library := AnimationLibrary.new()
	library.add_animation(POSE_NAME, _animation)
	poser.add_animation_library(&"", library)
	_root.add_child(poser, false, Node.INTERNAL_MODE_BACK)
	poser.root_node = poser.get_path_to(_root)
	poser.assigned_animation = POSE_NAME
	return poser


func _remember_values_of_track(index: int) -> void:
	var path := _animation.track_get_path(index)
	var type := _animation.track_get_type(index)
	var node := _root.get_node_or_null(path)
	if node == null:
		return
	if type in TRANSFORM_TRACK_TYPES:
		_remember_transform(node, path)
	elif type == Animation.TYPE_BLEND_SHAPE:
		_remember_blend_shape(node, path)
	else:
		_remember_property(path)


func _remember_property(path: NodePath) -> void:
	var found := _root.get_node_and_resource(path)
	if found[0] == null:
		return
	var target: Object = found[1] if found[1] != null else found[0]
	var property: NodePath = found[2]
	_restorers.append(target.set_indexed.bind(property, target.get_indexed(property)))


func _remember_transform(node: Node, path: NodePath) -> void:
	if node is Skeleton3D and path.get_subname_count() > 0:
		var skeleton := node as Skeleton3D
		var bone := skeleton.find_bone(path.get_concatenated_subnames())
		if bone < 0:
			return
		_restorers.append(skeleton.set_bone_pose_position.bind(bone, skeleton.get_bone_pose_position(bone)))
		_restorers.append(skeleton.set_bone_pose_rotation.bind(bone, skeleton.get_bone_pose_rotation(bone)))
		_restorers.append(skeleton.set_bone_pose_scale.bind(bone, skeleton.get_bone_pose_scale(bone)))
	elif node is Node3D:
		for property in NODE_3D_TRANSFORM_PROPERTIES:
			_restorers.append(node.set.bind(property, node.get(property)))


func _remember_blend_shape(node: Node, path: NodePath) -> void:
	if not node is MeshInstance3D or path.get_subname_count() == 0:
		return
	var mesh_instance := node as MeshInstance3D
	var shape := mesh_instance.find_blend_shape_by_name(path.get_concatenated_subnames())
	if shape >= 0:
		_restorers.append(mesh_instance.set_blend_shape_value.bind(shape, mesh_instance.get_blend_shape_value(shape)))


static func _posed_copy_of(animation: Animation) -> Animation:
	var copy := animation.duplicate() as Animation
	for index in range(copy.get_track_count() - 1, -1, -1):
		if not copy.track_get_type(index) in POSED_TRACK_TYPES:
			copy.remove_track(index)
	return copy
