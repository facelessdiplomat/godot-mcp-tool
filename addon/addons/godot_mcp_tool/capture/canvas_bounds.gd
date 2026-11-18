extends RefCounted


static func measure(node: Node) -> Dictionary:
	var visuals: Array[Rect2] = []
	var collisions: Array[Rect2] = []
	_collect(node, visuals, collisions)
	var chosen := visuals if not visuals.is_empty() else collisions
	var rect := Rect2(_origin_of(node), Vector2.ZERO)
	if not chosen.is_empty():
		rect = chosen[0]
		for other in chosen.slice(1):
			rect = rect.merge(other)
	return {"rect": rect, "visual_count": visuals.size(), "collision_count": collisions.size()}


static func _collect(node: Node, visuals: Array[Rect2], collisions: Array[Rect2]) -> void:
	var visual: Variant = _visual_rect(node)
	if visual != null:
		visuals.append(visual)
	var collision: Variant = _collision_rect(node)
	if collision != null:
		collisions.append(collision)
	for child in node.get_children():
		_collect(child, visuals, collisions)


static func _visual_rect(node: Node) -> Variant:
	if node is Control:
		return (node as Control).get_global_rect()
	var local: Variant = _local_visual_rect(node)
	if local == null:
		return null
	return (node as CanvasItem).get_global_transform() * (local as Rect2)


static func _local_visual_rect(node: Node) -> Variant:
	if node is Sprite2D:
		return (node as Sprite2D).get_rect() if (node as Sprite2D).texture != null else null
	if node is AnimatedSprite2D:
		return _animated_sprite_rect(node as AnimatedSprite2D)
	if node is Polygon2D:
		var polygon := node as Polygon2D
		return null if polygon.polygon.is_empty() else Rect2(_points_rect(polygon.polygon).position + polygon.offset, _points_rect(polygon.polygon).size)
	if node is Line2D:
		var line := node as Line2D
		return null if line.points.is_empty() else _points_rect(line.points).grow(line.width / 2.0)
	if node is MeshInstance2D and (node as MeshInstance2D).mesh != null:
		var aabb := (node as MeshInstance2D).mesh.get_aabb()
		return Rect2(aabb.position.x, aabb.position.y, aabb.size.x, aabb.size.y)
	if node is TileMapLayer and (node as TileMapLayer).tile_set != null:
		var layer := node as TileMapLayer
		var used := layer.get_used_rect()
		var tile_size := Vector2(layer.tile_set.tile_size)
		return null if used.size == Vector2i.ZERO else Rect2(Vector2(used.position) * tile_size, Vector2(used.size) * tile_size)
	return null


static func _animated_sprite_rect(sprite: AnimatedSprite2D) -> Variant:
	if sprite.sprite_frames == null or not sprite.sprite_frames.has_animation(sprite.animation) or sprite.sprite_frames.get_frame_count(sprite.animation) == 0:
		return null
	var texture := sprite.sprite_frames.get_frame_texture(sprite.animation, clampi(sprite.frame, 0, sprite.sprite_frames.get_frame_count(sprite.animation) - 1))
	if texture == null:
		return null
	var size := texture.get_size()
	return Rect2(sprite.offset - size / 2.0 if sprite.centered else sprite.offset, size)


static func _collision_rect(node: Node) -> Variant:
	if node is CollisionShape2D and (node as CollisionShape2D).shape != null:
		return (node as CollisionShape2D).get_global_transform() * (node as CollisionShape2D).shape.get_rect()
	if node is CollisionPolygon2D and not (node as CollisionPolygon2D).polygon.is_empty():
		return (node as CollisionPolygon2D).get_global_transform() * _points_rect((node as CollisionPolygon2D).polygon)
	return null


static func _origin_of(node: Node) -> Vector2:
	if node is Node2D:
		return (node as Node2D).global_position
	if node is Control:
		return (node as Control).global_position
	return Vector2.ZERO


static func _points_rect(points: PackedVector2Array) -> Rect2:
	var rect := Rect2(points[0], Vector2.ZERO)
	for point in points:
		rect = rect.expand(point)
	return rect
