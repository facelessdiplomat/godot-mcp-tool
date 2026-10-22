extends RefCounted

const EnumOptions := preload("../codec/enum_options.gd")
const VariantCodec := preload("../codec/variant_codec.gd")

const OPTION_ENUMS := {
	"meshes/light_baking": "Disabled,Static,Static Lightmaps,Dynamic",
	"materials/extract": "Keep Internal,Extract Once,Extract and Overwrite",
	"materials/extract_format": "Text,Binary,Material",
}

const NODE_OPTIONS := {
	"import/skip_import": {"type": TYPE_BOOL},
	"node/node_type": {"type": TYPE_STRING},
	"generate/physics": {"type": TYPE_BOOL},
	"generate/navmesh": {"type": TYPE_INT, "hint": PROPERTY_HINT_ENUM, "hint_string": "Disabled,Mesh + NavMesh,NavMesh Only"},
	"generate/occluder": {"type": TYPE_INT, "hint": PROPERTY_HINT_ENUM, "hint_string": "Disabled,Mesh + Occluder,Occluder Only"},
	"physics/body_type": {"type": TYPE_INT, "hint": PROPERTY_HINT_ENUM, "hint_string": "StaticBody3D,RigidBody3D,Area3D"},
	"physics/shape_type": {
		"type": TYPE_INT,
		"hint": PROPERTY_HINT_ENUM,
		"hint_string": "Decompose Convex,Single Convex,Trimesh,Box,Sphere,Cylinder,Capsule,Automatic",
	},
	"physics/layer": {"type": TYPE_INT, "hint": PROPERTY_HINT_LAYERS_3D_PHYSICS},
	"physics/mask": {"type": TYPE_INT, "hint": PROPERTY_HINT_LAYERS_3D_PHYSICS},
	"primitive/size": {"type": TYPE_VECTOR3},
	"primitive/height": {"type": TYPE_FLOAT},
	"primitive/radius": {"type": TYPE_FLOAT},
	"primitive/position": {"type": TYPE_VECTOR3},
	"primitive/rotation": {"type": TYPE_VECTOR3},
	"mesh_instance/layers": {"type": TYPE_INT, "hint": PROPERTY_HINT_LAYERS_3D_RENDER},
	"mesh_instance/cast_shadow": {"type": TYPE_INT, "hint": PROPERTY_HINT_ENUM, "hint_string": "Off,On,Double-Sided,Shadows Only"},
}

const SETTABLE_TYPES := [TYPE_BOOL, TYPE_INT, TYPE_FLOAT, TYPE_STRING, TYPE_VECTOR2, TYPE_VECTOR3, TYPE_COLOR]


static func option_property(name: String, current_value: Variant) -> Variant:
	if OPTION_ENUMS.has(name):
		return _property(name, {"type": TYPE_INT, "hint": PROPERTY_HINT_ENUM, "hint_string": OPTION_ENUMS[name]})
	if not typeof(current_value) in SETTABLE_TYPES:
		return null
	return _property(name, {"type": typeof(current_value)})


static func node_option_property(name: String) -> Variant:
	if not NODE_OPTIONS.has(name):
		return null
	return _property(name, NODE_OPTIONS[name])


static func node_option_names() -> Array:
	return NODE_OPTIONS.keys()


static func describe_option(name: String, value: Variant, codec: VariantCodec) -> Variant:
	if OPTION_ENUMS.has(name) and value is int:
		return _enum_name(OPTION_ENUMS[name], value, codec)
	return codec.encode(value)


static func describe_node_option(name: String, value: Variant, codec: VariantCodec) -> Variant:
	var option: Dictionary = NODE_OPTIONS.get(name, {})
	if option.get("hint") == PROPERTY_HINT_ENUM and value is int:
		return _enum_name(option["hint_string"], value, codec)
	return codec.encode(value)


static func _property(name: String, option: Dictionary) -> Dictionary:
	return {"name": name, "type": option["type"], "hint": option.get("hint", PROPERTY_HINT_NONE), "hint_string": option.get("hint_string", ""), "usage": PROPERTY_USAGE_DEFAULT}


static func _enum_name(hint_string: String, value: int, codec: VariantCodec) -> Variant:
	var option_name := EnumOptions.name_of(EnumOptions.parse(hint_string), value)
	return option_name if not option_name.is_empty() else codec.encode(value)
