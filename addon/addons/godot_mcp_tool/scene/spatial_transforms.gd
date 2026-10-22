extends RefCounted


static func global_of(node: Node) -> Transform3D:
	if not node is Node3D:
		return Transform3D.IDENTITY
	var placed := node as Node3D
	var world := placed.transform
	while not placed.top_level and placed.get_parent() is Node3D:
		placed = placed.get_parent() as Node3D
		world = placed.transform * world
	return world
