extends RefCounted

const GodotMcpReadyMessage := preload("ready_message.gd")
const GodotMcpRuntimeProtocol := preload("runtime_protocol.gd")


func send_entries(entries: Array) -> void:
	EngineDebugger.send_message(GodotMcpRuntimeProtocol.LOG_MESSAGE, [entries])


func send_ready(scene_path: String, windowless: bool) -> void:
	EngineDebugger.send_message(GodotMcpRuntimeProtocol.READY_MESSAGE, [GodotMcpReadyMessage.build(scene_path, windowless)])


func close() -> void:
	pass
