extends RefCounted

const CommandRouter := preload("../../commands/command_router.gd")
const GamePropertiesGetCommand := preload("game_properties_get_command.gd")
const GamePropertiesSetCommand := preload("game_properties_set_command.gd")
const GameScene := preload("game_scene.gd")
const GameTreeCommand := preload("game_tree_command.gd")
const GameWaitCommand := preload("game_wait_command.gd")
const PropertyEditor := preload("../../scene/property_editor.gd")
const VariantCodec := preload("../../codec/variant_codec.gd")


static func build_router(scene_root_provider: Callable) -> CommandRouter:
	var scene := GameScene.new(scene_root_provider)
	var codec := VariantCodec.new()
	var properties := PropertyEditor.new(codec)
	var router := CommandRouter.new()
	router.register("tree", GameTreeCommand.new(scene))
	router.register("properties.get", GamePropertiesGetCommand.new(scene, properties, codec))
	router.register("properties.set", GamePropertiesSetCommand.new(scene, properties))
	router.register("wait", GameWaitCommand.new(scene, codec))
	return router
