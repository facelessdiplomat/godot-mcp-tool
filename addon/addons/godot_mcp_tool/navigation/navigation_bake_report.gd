extends RefCounted

const NumberText := preload("../util/number_text.gd")
const SpatialTransforms := preload("../scene/spatial_transforms.gd")
const VariantCodec := preload("../codec/variant_codec.gd")

const CELL_SIZE_SETTING := "navigation/3d/default_cell_size"
const CELL_HEIGHT_SETTING := "navigation/3d/default_cell_height"
const DECIMALS := 3
const DECIMAL_SCALE := 1000.0


static func describe(region: NavigationRegion3D, path: String, codec: VariantCodec) -> Dictionary:
	var navigation_mesh := region.navigation_mesh
	var report := {
		"path": path,
		"polygons": navigation_mesh.get_polygon_count(),
		"vertices": navigation_mesh.get_vertices().size(),
		"agent_radius": _rounded(navigation_mesh.agent_radius),
		"agent_height": _rounded(navigation_mesh.agent_height),
		"warnings": _cell_warnings(navigation_mesh),
	}
	if navigation_mesh.get_polygon_count() == 0:
		report["reason"] = _reason_for_no_polygons(region)
		return report
	var bounds := SpatialTransforms.global_of(region) * _bounds_of(navigation_mesh.get_vertices())
	report["from"] = codec.encode(_rounded_vector(bounds.position))
	report["to"] = codec.encode(_rounded_vector(bounds.end))
	return report


static func _bounds_of(vertices: PackedVector3Array) -> AABB:
	var bounds := AABB(vertices[0], Vector3.ZERO)
	for vertex in vertices:
		bounds = bounds.expand(vertex)
	return bounds


static func _reason_for_no_polygons(region: NavigationRegion3D) -> String:
	var navigation_mesh := region.navigation_mesh
	var source := NavigationMeshSourceGeometryData3D.new()
	NavigationServer3D.parse_source_geometry_data(navigation_mesh, source, region)
	if source.has_data():
		return "the geometry has no surface that an agent of radius %s and height %s can walk on, with slopes up to %s degrees and steps up to %s; make the agent smaller in the NavigationMesh or the floor larger" % [
			_number(navigation_mesh.agent_radius),
			_number(navigation_mesh.agent_height),
			_number(navigation_mesh.agent_max_slope),
			_number(navigation_mesh.agent_max_climb),
		]
	if navigation_mesh.geometry_source_geometry_mode == NavigationMesh.SOURCE_GEOMETRY_ROOT_NODE_CHILDREN:
		return "it found no geometry under %s: the NavigationMesh reads the children of its region, so move the floor and the obstacles under it, or put them in a group and set geometry_source_geometry_mode and geometry_source_group_name" % region.name
	return "it found no geometry in the group \"%s\" that the NavigationMesh reads (geometry_source_group_name)" % navigation_mesh.geometry_source_group_name


static func _cell_warnings(navigation_mesh: NavigationMesh) -> Array:
	var warnings: Array = []
	var map_cell_size := float(ProjectSettings.get_setting(CELL_SIZE_SETTING))
	var map_cell_height := float(ProjectSettings.get_setting(CELL_HEIGHT_SETTING))
	if navigation_mesh.cell_size < map_cell_size and not is_equal_approx(navigation_mesh.cell_size, map_cell_size):
		warnings.append(_cell_warning("cell_size", navigation_mesh.cell_size, CELL_SIZE_SETTING, map_cell_size))
	if navigation_mesh.cell_height < map_cell_height and not is_equal_approx(navigation_mesh.cell_height, map_cell_height):
		warnings.append(_cell_warning("cell_height", navigation_mesh.cell_height, CELL_HEIGHT_SETTING, map_cell_height))
	return warnings


static func _cell_warning(property: String, value: float, setting: String, map_value: float) -> String:
	return "%s %s is smaller than the project's %s %s, so the game warns about rasterization errors on the navigation map; use the same value in both" % [property, _number(value), setting, _number(map_value)]


static func _number(value: float) -> String:
	return NumberText.of(value, DECIMALS)


static func _rounded(value: float) -> float:
	return roundf(value * DECIMAL_SCALE) / DECIMAL_SCALE


static func _rounded_vector(vector: Vector3) -> Vector3:
	return (vector * DECIMAL_SCALE).round() / DECIMAL_SCALE + Vector3.ZERO
